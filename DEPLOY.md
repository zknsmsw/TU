# Linux 服务器部署指南（teyvat-transit）

仓库：https://github.com/zknsmsw/TU.git （公开）。服务器推荐 **git clone + git pull** 部署与更新：
本地 `commit && push`，服务器一条 `deploy/update.sh`。不依赖 git 时仍可用「打 zip + scp/rsync 覆盖」的老办法，但不推荐。

仓库忽略 `client/dist`、`server/data`、`node_modules`，所以：

- clone / pull 后**没有前端产物**，必须在服务器上构建（第三节）；
- 数据库 `server/data/`（`db.json`、`.jwt-secret`）与上传图片留在服务器本地，`git pull` 不会覆盖，
  但也**不会被同步**——只能靠备份（第七节）。

## 一、服务器安装 Node.js（LTS 22 或 24）

Ubuntu/Debian：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应显示 v22.x
```

其他系统（CentOS/Rocky 用 dnf、或用 nvm）请参照 nodejs.org 官方文档。

> 打算用下面的 HTTPS 一键脚本（`deploy/setup-https.sh`）的话，这一节可以跳过 —— 它自己会装 Node 22 LTS。

## 二、clone 到 /opt/TU

`/opt/TU` 是**硬性路径**：`deploy/ecosystem.config.js` 里 `cwd` 写死了 `/opt/TU/server`。

```bash
sudo apt-get install -y git          # Ubuntu 26.04 默认不带 git
sudo git clone https://github.com/zknsmsw/TU.git /opt/TU
sudo git config --global --add safe.directory /opt/TU   # 避免 "detected dubious ownership"
```

服务器上已经有旧的 zip 部署时，别原地覆盖，先把数据搬过去：

```bash
sudo mv /opt/TU /opt/TU.old
sudo git clone https://github.com/zknsmsw/TU.git /opt/TU
sudo cp -a /opt/TU.old/server/data    /opt/TU/server/data
sudo cp -a /opt/TU.old/server/uploads /opt/TU/server/uploads 2>/dev/null || true
sudo chown -R root:root /opt/TU
pm2 list                             # 确认没有旧进程残留（用启动 pm2 的同一个用户执行）
```

## 三、装依赖 + 构建前端

后端依赖是纯 JS，很快；前端**必须**在服务器上构建（`client/dist` 不在仓库里）。

```bash
sudo bash -c 'cd /opt/TU && (cd server && npm ci --omit=dev) && (cd client && npm ci && npm run build)'
ls -l /opt/TU/client/dist/index.html     # 必须存在
```

> 国内服务器加镜像：`npm ci --registry=https://registry.npmmirror.com`
> 没构建、或构建后没重启时，页面会显示「请先 npm run build」，或者首页能开但 `/assets/*` 全 404 ——
> `server/src/index.js` 只在**进程启动时**注册静态目录，所以顺序永远是 **先构建、后重启**。

## 四、启动

```bash
sudo bash /opt/TU/deploy/setup-https.sh 你的域名 你的邮箱 阿里云AK 阿里云SK
```

上面这条是 HTTPS 一键部署（Node 22 LTS / nginx / acme.sh DNS-01 证书 / pm2 开机自启），
细节见 `deploy/README.md` 与 `HTTPS.md`。只想先在局域网 / 本机验证，用下面的手动方式：

前台启动（测试用）：

```bash
cd /opt/TU
npm start
# 看到「提瓦特交通联合后端已启动：http://localhost:3001」即成功
```

后台常驻（二选一）：

```bash
# 方式 A：nohup（最简单）
nohup npm start > /opt/TU/server.log 2>&1 &

# 方式 B：pm2（推荐，崩溃自动重启、开机自启）
sudo npm i -g pm2
pm2 start /opt/TU/server/src/index.js --name teyvat-transit
pm2 save
pm2 startup    # 按提示执行它输出的命令即可开机自启
```

> HTTPS 一键脚本用的是 `deploy/ecosystem.config.js`（后端跑 3002，`COOKIE_SECURE=1`）。
> 用明文 HTTP 访问时不要设 `COOKIE_SECURE`，否则浏览器会丢弃会话 Cookie，表现为「登录没反应」。

## 五、安全配置（公网部署强烈建议）

1. **JWT 密钥**：首次启动会自动生成随机密钥到 `server/data/.jwt-secret`（已自动排除在版本库外，本包已包含）。如需自管：

   ```bash
   # 生成一个 64 位随机密钥
   openssl rand -base64 48
   # 写入环境变量（写入 /etc/environment 或 systemd 单元文件）
   export JWT_SECRET="上面生成的密钥"
   ```

2. **文件权限**：

   ```bash
   chmod -R o-w /opt/TU            # 禁止其他用户写
   chmod 600 /opt/TU/server/data/.jwt-secret
   chmod 600 /opt/TU/server/data/db.json
   ```

3. **HTTPS（推荐用 Nginx 反向代理 + certbot 免费证书）**：

   ```nginx
   server {
       listen 443 ssl;
       server_name 你的域名;
       ssl_certificate     /etc/letsencrypt/live/你的域名/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/你的域名/privkey.pem;
       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   HTTPS 部署时给服务加环境变量 `COOKIE_SECURE=1`（会话 Cookie 追加 Secure 标志）。

4. **防火墙**：只放行 80/443（或你用的端口），3001 不要直接暴露公网。

## 六、升级 / 更新（git pull）

发版流程：**本地 `git commit && git push` → 服务器一条命令**。

```bash
sudo bash /opt/TU/deploy/update.sh
```

`deploy/update.sh` 依次做：备份 `server/data` + `server/uploads` 到 `/opt/tu-backups`（默认保留 30 份）
→ `git fetch` + `merge --ff-only` → 依赖按需 `npm ci` → 构建前端 → 重启 pm2 → 轮询 `/api/health` 自检。
可覆盖的环境变量：`BRANCH`、`PM2_NAME`、`BACKUP_DIR`、`KEEP_BACKUPS`、`NPM_REGISTRY`、`HEALTH_URL`。

回滚：

```bash
sudo bash /opt/TU/deploy/update.sh --rollback <提交或标签>
cd /opt/TU && sudo git checkout main && sudo git pull --ff-only   # 回滚后是 detached HEAD，这条恢复主线
```

> ⚠️ 服务器上**永远不要**执行 `git clean -fd`、`git reset --hard`、`git checkout .`：
> `server/data`（订单、账号）不在版本库，这些命令会直接删掉或回滚它。`update.sh` 用 `--ff-only`
> 就是为了杜绝这种情况。
>
> 不想用脚本时的等价命令：
> `cd /opt/TU && sudo git pull --ff-only && sudo bash -c 'cd client && npm ci && npm run build' && pm2 restart teyvat-transit`

## 七、数据备份

数据全部在 `/opt/TU/server/data/`（`db.json`、`.jwt-secret`）和 `/opt/TU/server/uploads/`（图片）。
`deploy/update.sh` 每次更新前都会自动打包到 `/opt/tu-backups/`，另外建议加一条夜间备份：

```bash
sudo crontab -e
30 3 * * * cd /opt/TU && tar -czf /opt/tu-backups/nightly-$(date +\%F).tar.gz server/data server/uploads
```

恢复：

```bash
sudo tar -xzf /opt/tu-backups/data-<时间>.tar.gz -C /opt/TU && pm2 restart teyvat-transit
```
