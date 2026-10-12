# HTTPS 一键部署（自定义端口 + 阿里云 DNS-01）

本目录是 HTTPS / Nginx / pm2 的落地工具。**代码怎么上服务器、日常怎么更新，以根目录的 `DEPLOY.md` 为准**：
先 git clone 到 `/opt/TU`、装依赖并构建前端，再回来跑本目录的 `setup-https.sh`；日常更新用 `deploy/update.sh`。

**端口方案（不用 80/443）：**

```
浏览器 ──https://域名:3000──> nginx(3000, TLS) ──> 后端 127.0.0.1:3002
浏览器 ──http://域名:3001────> nginx(3001) 301跳转 ──> https://域名:3000
```

**证书方案（不用 80/443 也能签发）：** Let's Encrypt 证书走 **DNS-01 验证**，acme.sh 通过阿里云 DNS API 添加 TXT 记录完成验证，与端口、IP 变化完全无关 —— 所以**动态 IP + DDNS 完全没问题**。

## 一、目录结构

```
/opt/TU/                      （git clone 出来的工作副本）
├── DEPLOY.md                 ← 部署总览：clone / 依赖 / 构建 / 更新 / 备份
├── HTTPS.md                  ← 原理与排查参考文档
└── deploy/
    ├── nginx-teyvat-transit.conf   Nginx 反代模板（__DOMAIN__ 会被脚本替换）
    ├── ecosystem.config.js         pm2 进程配置（后端跑 3002，COOKIE_SECURE=1）
    ├── setup-https.sh              一键部署脚本（本目录主角）
    ├── update.sh                   git pull 更新：备份 + 拉取 + 构建 + 重启 + 自检
    └── README.md                   本说明
```

## 二、开始前的准备（必须）

1. **域名在阿里云云解析**，并有一个 **RAM 子账号 AccessKey**：
   - 控制台 → RAM 访问控制 → 创建用户（勾选"OpenAPI 调用访问"，生成 AccessKey ID / Secret）；
   - 给该用户授权 **`AliyunDNSFullAccess`**（只给解析权限，不要用主账号 Key）。
2. **宽带是公网 IP**（路由器 WAN 口 IP 与网页查到的公网 IP 一致；若不一致说明是 CGNAT 大内网，本方案无效，需改用 Cloudflare Tunnel，见 HTTPS.md 附录）。
3. **路由器把 TCP 3000 和 3001 端口转发**到家里这台服务器（内网 IP）。DDNS 动态域名已在路由器/脚本里配置好，指向当前公网 IP。
4. 服务器防火墙（ufw）放行 3000/3001（脚本会自动加，也可手动：`sudo ufw allow 3000/tcp && sudo ufw allow 3001/tcp`）。

## 三、代码就位（git clone 到 /opt/TU）

```bash
sudo apt-get install -y git
sudo git clone https://github.com/zknsmsw/TU.git /opt/TU
sudo git config --global --add safe.directory /opt/TU
```

`client/dist` 不在版本库，clone 后必须先在服务器上构建（`DEPLOY.md` 第三节：`server` 装
`npm ci --omit=dev`，`client` 装 `npm ci` 后 `npm run build`），再执行下一节。
服务器上已有旧的 zip 部署时，按 `DEPLOY.md` 第二节迁移数据，别原地覆盖。

## 四、一键部署（服务器上执行）

```bash
cd /opt/TU/deploy
sudo bash setup-https.sh 你的域名 你的邮箱 阿里云AccessKeyID 阿里云AccessKeySecret
# 示例：sudo bash setup-https.sh train.example.com you@example.com LTAIxxxx Sxxxx
```

> AccessKey 也可以不写在命令行：脚本会提示你输入（Secret 不回显），或用环境变量 `ALI_AK` / `ALI_SK`。

脚本自动完成：装 Node.js（仅当主版本 < 22）→ 装 nginx → 装后端依赖 → 装 acme.sh → 通过阿里云 DNS 申请 Let's Encrypt 证书（DNS-01，不碰 80/443）→ 写 nginx 配置（3000 HTTPS + 3001 跳转 → 后端 3002）→ pm2 启动 → 配置开机自启。

完成后访问 **`https://你的域名:3000`**。管理员初始密码在 `sudo pm2 logs teyvat-transit` 里（只显示一次）。

> **开机自启要自己确认一下**：脚本里 `pm2 startup systemd -u root --hp /root` 的输出被重定向掉了，
> 所以 systemd 单元可能没 enable。检查并补上：
> ```bash
> systemctl is-enabled pm2-root            # 不是 enabled 就执行下面两条
> sudo pm2 startup systemd -u root --hp /root
> # 原样执行上一条打印出来的 sudo env PATH=... systemctl enable pm2-root
> ```
> 不装 systemd 自启的话，机器重启后站点不会自己起来（数据不丢，但页面打不开）。

## 五、手动部署方式（不想跑脚本时）

1. 启动后端（端口 3002，HTTPS 必需 `COOKIE_SECURE=1`；后端已绑定 `127.0.0.1`，仅本机 nginx 可访问）：
   ```bash
   cd /opt/TU/server && npm install --omit=dev
   cd /opt/TU && sudo pm2 start deploy/ecosystem.config.js && sudo pm2 save
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
| **更新到最新代码** | `sudo bash /opt/TU/deploy/update.sh` |
| 看状态 | `sudo pm2 status`（pm2 按用户隔离，脚本是以 root 起的） |
| 看日志 | `sudo pm2 logs teyvat-transit` |
| 重启后端 | `sudo pm2 restart teyvat-transit` |
| 证书状态 | `~/.acme.sh/acme.sh --list` |
| 手动续期演练 | `~/.acme.sh/acme.sh --renew -d 你的域名 --force`（慎用，会真续期） |
| 续期定时器 | `crontab -l`（acme.sh 装好的每日任务，自动续期并重载 nginx） |

## 七、常见问题

- **`pm2 status` 里看不到应用**：pm2 守护进程按用户隔离。脚本是以 root 运行的（`/root/.pm2`），所以要用 `sudo pm2 status`；别再用普通用户起一个，那样会开出第二个守护进程。
- **证书申请失败 / TXT 验证超时**：AccessKey 权限不足（需 `AliyunDNSFullAccess`）、域名不在阿里云云解析、或阿里云 TXT 生效慢（稍等重跑 `--issue`）。
- **外网打不开 https://域名:3000**：路由器没转发 3000/3001；或宽带是 CGNAT（大内网），端口转发无效 → 见 HTTPS.md 附录的 Cloudflare Tunnel 方案。
- **HTTP 入口 3001 打不开**：确认 ufw 放行了 3001（`sudo ufw status`）。
- **上传宣传图 413**：`client_max_body_size 16m` 没生效 —— 确认用的是本目录的 nginx 配置。
- **登录后立刻失效**：`COOKIE_SECURE=1` 与协议不匹配 —— 保持该环境变量，并全程用 `https://域名:3000` 访问。
- **限速把所有人当成同一个 IP**：直连 nginx 时已解决（`server/src/index.js` 带 `app.set('trust proxy', 1);`）；前面再套 CDN / ESA 时不成立，见 `HTTPS.md` 第七节的两条限速条目。
- **IPv6 直连**：nginx 模板已带 `listen [::]`（v4+v6 双栈）；若服务器未启用 IPv6，删掉配置里带 `[::]` 的两行再 `systemctl restart nginx`。
- **想同时用 80/443 了**：把 nginx 的 `listen 3000 ssl` 改成 `listen 443 ssl`、`listen 3001` 改成 `listen 80`（含 `[::]` 对应行），跳转地址去掉 `:3000`，并在路由器上转发 80/443 —— 证书申请方式不变（DNS-01 不需要开 80/443）。
