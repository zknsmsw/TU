# 部署包使用说明（teyvat-transit-https · 自定义端口 + 阿里云 DNS 版）

本压缩包 = 项目全部代码（含前端构建产物 `client/dist`、数据 `server/data`、图片 `server/uploads`，不含 node_modules）+ 部署工具。

**端口方案（不用 80/443）：**

```
浏览器 ──https://域名:3000──> nginx(3000, TLS) ──> 后端 127.0.0.1:3002
浏览器 ──http://域名:3001────> nginx(3001) 301跳转 ──> https://域名:3000
```

**证书方案（不用 80/443 也能签发）：** Let's Encrypt 证书走 **DNS-01 验证**，acme.sh 通过阿里云 DNS API 添加 TXT 记录完成验证，与端口、IP 变化完全无关 —— 所以**动态 IP + DDNS 完全没问题**。

## 一、包内结构

```
teyvat-transit-https/
├── 项目文件…（server/ client/ package.json 等）
├── HTTPS.md                  ← 原理与排查参考文档
└── deploy/
    ├── nginx-teyvat-transit.conf   Nginx 反代模板（__DOMAIN__ 会被脚本替换）
    ├── ecosystem.config.js         pm2 进程配置（后端跑 3002，COOKIE_SECURE=1）
    ├── setup-https.sh              一键部署脚本
    └── README.md                   本说明
```

## 二、开始前的准备（必须）

1. **域名在阿里云云解析**，并有一个 **RAM 子账号 AccessKey**：
   - 控制台 → RAM 访问控制 → 创建用户（勾选"OpenAPI 调用访问"，生成 AccessKey ID / Secret）；
   - 给该用户授权 **`AliyunDNSFullAccess`**（只给解析权限，不要用主账号 Key）。
2. **宽带是公网 IP**（路由器 WAN 口 IP 与网页查到的公网 IP 一致；若不一致说明是 CGNAT 大内网，本方案无效，需改用 Cloudflare Tunnel，见 HTTPS.md 附录）。
3. **路由器把 TCP 3000 和 3001 端口转发**到家里这台服务器（内网 IP）。DDNS 动态域名已在路由器/脚本里配置好，指向当前公网 IP。
4. 服务器防火墙（ufw）放行 3000/3001（脚本会自动加，也可手动：`sudo ufw allow 3000/tcp && sudo ufw allow 3001/tcp`）。

## 三、上传并解压（Windows 本地执行）

```bash
scp C:\Users\MI\Desktop\TU\teyvat-transit-https.zip 用户名@服务器IP:/opt/
```

服务器上解压：

```bash
cd /opt && unzip teyvat-transit-https.zip        # 得到 /opt/TU
```

## 四、一键部署（服务器上执行）

```bash
cd /opt/TU/deploy
sudo bash setup-https.sh 你的域名 你的邮箱 阿里云AccessKeyID 阿里云AccessKeySecret
# 示例：sudo bash setup-https.sh train.example.com you@example.com LTAIxxxx Sxxxx
```

> AccessKey 也可以不写在命令行：脚本会提示你输入（Secret 不回显），或用环境变量 `ALI_AK` / `ALI_SK`。

脚本自动完成：装 Node.js（22 LTS）→ 装 nginx → 装后端依赖 → 装 acme.sh → 通过阿里云 DNS 申请 Let's Encrypt 证书（DNS-01，不碰 80/443）→ 写 nginx 配置（3000 HTTPS + 3001 跳转 → 后端 3002）→ pm2 启动 → 配置开机自启。

完成后访问 **`https://你的域名:3000`**。管理员初始密码在 `pm2 logs teyvat-transit` 里（只显示一次）。

## 五、手动部署方式（不想跑脚本时）

1. 启动后端（端口 3002，HTTPS 必需 `COOKIE_SECURE=1`；后端已绑定 `127.0.0.1`，仅本机 nginx 可访问）：
   ```bash
   cd /opt/TU/server && npm install --omit=dev
   cd /opt/TU && pm2 start deploy/ecosystem.config.js && pm2 save
   ```
2. 安装 nginx 与 acme.sh：
   ```bash
   sudo apt install -y nginx
   curl https://get.acme.sh | sh -s email=你的邮箱
   ```
3. 申请证书（DNS-01，等 TXT 生效约 1~2 分钟）：
   ```bash
   export Ali_Key="你的AccessKeyID"
   export Ali_Secret="你的AccessKeySecret"
   /root/.acme.sh/acme.sh --issue --dns dns_ali -d 你的域名 --server letsencrypt
   ```
4. 把证书装到固定路径并让续期后自动重载 nginx：
   ```bash
   sudo mkdir -p /etc/letsencrypt/live/你的域名
   /root/.acme.sh/acme.sh --install-cert -d 你的域名 \
     --key-file /etc/letsencrypt/live/你的域名/privkey.pem \
     --fullchain-file /etc/letsencrypt/live/你的域名/fullchain.pem \
     --reloadcmd "systemctl reload nginx"
   ```
5. 写 nginx 配置（把 `__DOMAIN__` 换成你的域名）并启用：
   ```bash
   sudo sed "s/__DOMAIN__/你的域名/g" /opt/TU/deploy/nginx-teyvat-transit.conf \
     > /etc/nginx/sites-available/teyvat-transit
   sudo ln -sf /etc/nginx/sites-available/teyvat-transit /etc/nginx/sites-enabled/teyvat-transit
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo fuser -k 3000/tcp 3001/tcp 3002/tcp 2>/dev/null || true
   sudo nginx -t && sudo systemctl restart nginx
   ```
6. 验证：`curl -I http://你的域名:3001`（应 301）、`curl -I https://你的域名:3000`（应 200）。

## 六、日常运维

| 操作 | 命令 |
|---|---|
| 看状态 | `pm2 status` |
| 看日志 | `pm2 logs teyvat-transit` |
| 重启后端 | `pm2 restart teyvat-transit` |
| 证书状态 | `~/.acme.sh/acme.sh --list` |
| 手动续期演练 | `~/.acme.sh/acme.sh --renew -d 你的域名 --force`（慎用，会真续期） |
| 续期定时器 | `crontab -l`（acme.sh 装好的每日任务，自动续期并重载 nginx） |

## 七、常见问题

- **证书申请失败 / TXT 验证超时**：AccessKey 权限不足（需 `AliyunDNSFullAccess`）、域名不在阿里云云解析、或阿里云 TXT 生效慢（稍等重跑 `--issue`）。
- **外网打不开 https://域名:3000**：路由器没转发 3000/3001；或宽带是 CGNAT（大内网），端口转发无效 → 见 HTTPS.md 附录的 Cloudflare Tunnel 方案。
- **HTTP 入口 3001 打不开**：确认 ufw 放行了 3001（`sudo ufw status`）。
- **上传宣传图 413**：`client_max_body_size 16m` 没生效 —— 确认用的是本包 nginx 配置。
- **登录后立刻失效**：`COOKIE_SECURE=1` 与协议不匹配 —— 保持该环境变量，并全程用 `https://域名:3000` 访问。
- **限速把所有人当同一个 IP**：已内置解决 —— `server/src/index.js` 带 `app.set('trust proxy', 1);`。
- **IPv6 直连**：nginx 模板已带 `listen [::]`（v4+v6 双栈）；若服务器未启用 IPv6，删掉配置里带 `[::]` 的两行再 `systemctl restart nginx`。
- **想同时用 80/443 了**：把 nginx 的 `listen 3000 ssl` 改成 `listen 443 ssl`、`listen 3001` 改成 `listen 80`（含 `[::]` 对应行），跳转地址去掉 `:3000`，并在路由器上转发 80/443 —— 证书申请方式不变（DNS-01 不需要开 80/443）。
