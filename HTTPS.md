# 给「提瓦特交通联合」配置 HTTPS（Let's Encrypt 免费证书 · 自定义端口版）

适用环境：Ubuntu 26.04 LTS + Nginx + **acme.sh**（Let's Encrypt 客户端），域名托管在**阿里云云解析**，家庭宽带 **动态 IP + DDNS**。

## 方案总览

```
浏览器 ──https://域名:3000──> nginx(3000, TLS 终止) ──> 后端 127.0.0.1:3002
浏览器 ──http://域名:3001────> nginx(3001) 301跳转 ──> https://域名:3000
```

- **不用 80/443**：证书用 **DNS-01 验证** 签发 —— acme.sh 调阿里云 DNS API 添加一条 TXT 记录完成域名所有权验证，**整个过程中 80/443 完全不参与**，签发和续期都不需要它们。
- **动态 IP + DDNS 没问题**：DNS-01 只和阿里云 DNS API 打交道，跟你家公网 IP 怎么变无关；DDNS 只负责让域名解析到当前 IP。两者互不干扰，续期照常自动。
- **为什么用 acme.sh 而不是 certbot**：Ubuntu 26.04 的 certbot 4.x 与老牌阿里云插件 `certbot-dns-aliyun` 存在[兼容问题](https://github.com/tengattack/certbot-dns-aliyun/issues/32)；acme.sh 内置 `dns_ali` 阿里云支持、纯 shell 零 Python 依赖、安装即配好 cron 自动续期，是阿里云场景最稳的路线。签发的同样是 Let's Encrypt 免费证书（acme.sh 默认是 ZeroSSL，脚本里已显式指定 `--server letsencrypt`）。

## 一、前置条件（缺一不可）

1. **域名托管在阿里云云解析**（阿里云 DNS API 只能操作托管在阿里云的域名）。
2. **RAM 子账号 AccessKey**，授权 `AliyunDNSFullAccess`：
   控制台 → RAM 访问控制 → 创建用户（勾选"OpenAPI 调用访问"）→ 授权 AliyunDNSFullAccess → 得到 AccessKey ID / Secret。**不要用主账号 Key。**
3. **公网 IP**：路由器 WAN 口 IP 与网页查询到的公网 IP 一致。**不一致 = CGNAT 大内网**，端口转发无效，需改用 Cloudflare Tunnel（见附录 A）。
4. **路由器端口转发**：TCP **3000** 和 **3001** 转发到家里服务器内网 IP；DDNS 已指向当前公网 IP。
5. 服务器 ufw 放行 3000/3001（脚本会自动加）。

## 二、一键部署

> 前置：`/opt/TU` 已是 git 工作副本，且 `client/dist` 已构建（`DEPLOY.md` 第二、三节）。
> `setup-https.sh` 只管 HTTPS / Nginx / pm2 —— 它既不 clone 代码，也不构建前端。

```bash
cd /opt/TU/deploy
sudo bash setup-https.sh 你的域名 你的邮箱 阿里云AccessKeyID 阿里云AccessKeySecret
```

脚本会按需装 Node.js（仅在主版本 < 22 时；已有更高版本不动）→ nginx → 后端依赖 → acme.sh → 签发证书（约 1~2 分钟）→ 写 nginx 配置 → pm2 启动 + 开机自启。完成后访问 `https://你的域名:3000`。

> 日常更新代码不用重跑本脚本：`sudo bash /opt/TU/deploy/update.sh`。

## 三、手动部署（等价步骤，方便排查）

```bash
# 1. 装 nginx + acme.sh
sudo apt install -y nginx
curl https://get.acme.sh | sh -s email=你的邮箱

# 2. 申请证书（DNS-01）
export Ali_Key="AccessKeyID"
export Ali_Secret="AccessKeySecret"
~/.acme.sh/acme.sh --issue --dns dns_ali -d 你的域名 --server letsencrypt

# 3. 证书装到固定路径（nginx 用），续期后自动 reload
sudo mkdir -p /etc/letsencrypt/live/你的域名
~/.acme.sh/acme.sh --install-cert -d 你的域名 \
  --key-file /etc/letsencrypt/live/你的域名/privkey.pem \
  --fullchain-file /etc/letsencrypt/live/你的域名/fullchain.pem \
  --reloadcmd "systemctl reload nginx"

# 4. 写 nginx 配置并启用（模板见 deploy/nginx-teyvat-transit.conf）
sudo sed "s/__DOMAIN__/你的域名/g" /opt/TU/deploy/nginx-teyvat-transit.conf \
  > /etc/nginx/sites-available/teyvat-transit
sudo ln -sf /etc/nginx/sites-available/teyvat-transit /etc/nginx/sites-enabled/teyvat-transit
sudo rm -f /etc/nginx/sites-enabled/default
sudo fuser -k 3000/tcp 3001/tcp 3002/tcp 2>/dev/null || true
sudo nginx -t && sudo systemctl restart nginx

# 5. 启动后端（内部端口 3002，COOKIE_SECURE=1；后端已绑定 127.0.0.1，只给本机 nginx 访问）
cd /opt/TU && sudo pm2 start deploy/ecosystem.config.js && sudo pm2 save
```

## 四、Nginx 配置要点（deploy/nginx-teyvat-transit.conf）

- **3001（HTTP）**：`return 301 https://域名:3000$request_uri;` —— 非标准端口必须**在跳转里显式带 `:3000`**（`$host` 不含端口）。
- **3000（HTTPS）**：`listen 3000 ssl;` + `http2 on;`（nginx ≥1.25.1 新写法，Ubuntu 26.04 满足），证书指向 `/etc/letsencrypt/live/域名/`，反代到 `127.0.0.1:3002`。
- **IPv6**：两个 server 块已带 `listen [::]:3001;` / `listen [::]:3000 ssl;`，支持 v6 访客直连（还需宽带公网 IPv6 + 路由器放行 v6 入站）。**本机未启用 IPv6 时删除这两行**，否则 `nginx -t` 报 `Address family not supported`。
- **`client_max_body_size 16m` 必须有**：宣传图是 base64 进 JSON（后端限 15MB），nginx 默认 1MB 会 413。
- 反代头带上 `X-Forwarded-Proto $scheme`，让后端感知 HTTPS。

## 五、续期（自动）

acme.sh 安装时自动写入 root 的 crontab（每天检查），到期前 30 天内自动续期，续期后自动执行 `--reloadcmd` 重载 nginx。验证：

```bash
crontab -l                 # 应有一行 acme.sh 每日任务
~/.acme.sh/acme.sh --list  # 看证书到期时间
```

## 六、验证清单

| 检查项 | 方法 | 期望 |
|---|---|---|
| HTTP→HTTPS | `curl -I http://域名:3001` | 301，Location 带 `:3000` |
| HTTPS 可达 | `curl -I https://域名:3000` | 200 |
| 证书 | `echo \| openssl s_client -connect 域名:3000 -servername 域名 2>/dev/null \| openssl x509 -noout -dates` | 到期日 ≈ 90 天后 |
| 登录 Cookie | 浏览器开发者工具 → Cookies | `tt_token` 带 Secure、HttpOnly |
| 上传图片 | 后台 → 宣传图管理 → 上传 | 不再 413 |
| 外网访问 | 手机流量访问 `https://域名:3000` | 正常打开（验证端口转发） |

## 七、常见问题

- **外网打不开**：先确认内网能开 `https://域名:3000`（本机 hosts 或局域网访问）—— 能开说明是路由器转发/CGNAT 问题；不能开查 ufw 和 nginx 日志（`journalctl -u nginx -e`）。
- **TXT 验证失败**：AccessKey 没授权 `AliyunDNSFullAccess`；或域名不在阿里云云解析；或阿里云生效慢，稍后重跑 `--issue`。
- **续期后证书没更新**：确认 crontab 在、`--reloadcmd` 配置成功（`~/.acme.sh/域名/域名.conf` 里有 RELOADCMD）。
- **登录态异常**：`COOKIE_SECURE=1` 与协议不匹配。保持该变量且全程走 `https://域名:3000`。
- **`pm2 status` 看不到应用**：pm2 守护进程按用户隔离。`setup-https.sh` 是以 root 起的（`/root/.pm2`），所以要用 `sudo pm2 status`；用普通用户再跑一次会开出第二个守护进程，两边列表互相看不到。
- **限速把所有人当成同一个 IP（直连场景）**：`server/src/index.js` 内置 `app.set('trust proxy', 1);`，nginx 直连时按真实客户端 IP 生效。
- **限速把所有人当成同一个 IP（前面挂了 CDN / ESA / WAF）**：上面那条结论**不成立**。模板里的
  `$proxy_add_x_forwarded_for` 会把边缘节点 IP 追加进 XFF，而 `trust proxy = 1` 只信最近一跳，于是
  `req.ip` 变成边缘节点 IP —— 同一节点的访客共用限速额度（全局 300 次/分钟，会直接误伤正常用户；
  登录锁定键是 `IP:用户名`，相对不敏感）。**解决**：把 nginx 配置里的 `$proxy_add_x_forwarded_for`
  换成 `$http_x_forwarded_for`（原样透传上游给的真实客户端 IP）：
  ```bash
  sudo sed -i 's/\$proxy_add_x_forwarded_for/\$http_x_forwarded_for/' /etc/nginx/sites-available/teyvat-transit
  sudo nginx -t && sudo systemctl reload nginx
  ```
  阿里云还会带 `Ali-CDN-Real-IP`（或 `X-Real-IP`），想更严谨可以用 `real_ip_header Ali-CDN-Real-IP;` + `set_real_ip_from` 指定回源段。注意：`/etc/nginx/` 下的文件不在版本库里，`git pull` 不会碰它，改了也不会被覆盖。
- **前面挂了 CDN / ESA（例如访客域名 `web.example.com`、回源 `cuhome.example.com`）**：访客看到的是 CDN 给
  加速域名签的证书，家里这张证书管的是回源那一段，两套互不相干、都留着。CDN 源站填：回源域名、回源端口
  （本项目 nginx 是 3000 HTTPS / 3001 HTTP）、协议按你选的（选 HTTP 回源就不用在家里做 TLS，但那时**别用
  仓库里的 nginx 模板**，因为 3001 那个块是 301 跳转，会把 CDN 的回源请求跳走）；**回源 Host 要和 nginx
  `server_name` 对得上**（填回源域名，或把两个域名一起写进 `server_name`）。源站域名**必须解析到真实家宽
  IP，不要再被 CDN 代理一次**，否则回源会打回 CDN 成环。
- **以后想改回 80/443**：改 nginx 监听端口和跳转地址、路由器改转发 80/443 即可，证书方案（DNS-01）不用动。

## 附录 A：CGNAT（大内网）怎么办

如果宽带没有公网 IP（WAN 口 IP ≠ 网页查到的 IP），端口转发无效，本方案不适用。可选：

- **Cloudflare Tunnel**（免费）：`cloudflared` 与 Cloudflare 建立出站隧道，域名走 Cloudflare 代理访问你的服务，无需端口转发、无需公网 IP；证书由 Cloudflare 托管。参考：[Archon 的 Cloudflare Tunnel 部署讨论](https://github.com/coleam00/Archon/issues/1174)。
- 换有公网 IP 的宽带/轻量云服务器。

## 附录 B：其他 DNS 服务商（如果想换）

- **Cloudflare**：Ubuntu 源里就有官方插件 `python3-certbot-dns-cloudflare`（[universe 源](https://mirror.fi.ossplanet.net/ubuntu-ports/ubuntu-ports/pool/universe/p/python-certbot-dns-cloudflare/)），acme.sh 也内置 `dns_cf`。
- **DuckDNS**（免费 DDNS 子域名）：acme.sh 内置 `dns_duckdns`；certbot 有第三方插件 [certbot-dns-duckdns](https://pypi.org/project/certbot-dns-duckdns/)。
- 原则：只要 DNS 服务商提供 API 能写 TXT 记录，DNS-01 就能用，80/443 都不用开。

## 参考链接

- [acme.sh 官方](https://github.com/acmesh-official/acme.sh)
- [acme.sh 阿里云 DNS 用法（dns_ali）](https://github.com/acmesh-official/acme.sh/wiki/dnsapi#13-aliyun)
- [Let's Encrypt 官方文档](https://letsencrypt.org/docs/)
- [certbot-dns-aliyun 与 certbot 3.0 兼容性问题](https://github.com/tengattack/certbot-dns-aliyun/issues/32)
