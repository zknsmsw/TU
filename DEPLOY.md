# Linux 服务器部署指南（teyvat-transit）

仓库：https://github.com/zknsmsw/TU.git （公开）。服务器推荐 **git clone + git pull** 部署与更新：
本地 `commit && push`，服务器一条 `deploy/update.sh`。不依赖 git 时仍可用「打 zip + scp/rsync 覆盖」的老办法，但不推荐。

仓库忽略 `client/dist`、`server/data`、`node_modules`，所以：

- clone / pull 后**没有前端产物**，必须在服务器上构建（第三节）；
- 数据库 `server/data/`（`db.json`、`.jwt-secret`）与上传图片留在服务器本地，`git pull` 不会覆盖，
  但也**不会被同步**——只能靠备份（第七节）。

## 一、Node.js 版本

要求 **≥ 22.12**：`client` 的 vite 8 / @vitejs/plugin-react 6 声明的 engines 是 `^20.19.0 || >=22.12.0`。
**26.x 可用**（服务器现在是 Node 26.8，不用降级也不用动）；`server` 侧依赖更宽松
（express `>=0.10`、cors `>=0.10`、jsonwebtoken `>=12`，都没有上限）。

`node -v` 已经满足就跳过本节，全新机器才需要装：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

其他系统（CentOS/Rocky 用 dnf、或用 nvm）请参照 nodejs.org 官方文档。

> `deploy/setup-https.sh` 只在 `node -v` 主版本 **< 22** 时才去装 Node 22 —— 已有 26.8 时它什么都不做，
> **不会降级**。

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
sudo pm2 list                        # 确认没有旧进程残留
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

公网 HTTPS 走一键脚本：

```bash
sudo bash /opt/TU/deploy/setup-https.sh 你的域名 你的邮箱 阿里云AK 阿里云SK
```

它会装 nginx → 后端依赖 → acme.sh → 签发证书 → 写 nginx 配置（3000 HTTPS / 3001 跳转）→
pm2 启动 + 开机自启，完成后访问 `https://你的域名:3000`。细节见 `deploy/README.md` 与 `HTTPS.md`。

只想先在本机 / 局域网验证，不碰 nginx 和证书：

```bash
cd /opt/TU
npm start                                     # 前台，端口 3001，看日志方便
nohup npm start > /opt/TU/server.log 2>&1 &   # 想放后台就用这个（不走 HTTPS 时）
```

> **两条路线二选一，别同时起**，端口分配不一样：`npm start` 用 3001；一键脚本的
> `deploy/ecosystem.config.js` 用 3002（`COOKIE_SECURE=1`，只 bind `127.0.0.1`，交给本机 nginx 反代）。
>
> pm2 守护进程按用户隔离：root 是 `/root/.pm2`，普通用户是 `~/.pm2`，**两个列表互相看不到**，
> 所以 pm2 命令统一加 `sudo`，否则会出现「应用明明在跑，`pm2 status` 却是空的」。

## 五、安全配置（公网部署强烈建议）

1. **JWT 密钥**：首次启动会自动生成随机密钥并保存到 `server/data/.jwt-secret`（该目录被 `.gitignore` 排除，不进版本库）。如需自管：

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

3. **HTTPS**：由 `deploy/setup-https.sh` 负责（acme.sh + 阿里云 DNS-01，不占用 80/443）。
   端口对应关系是 **nginx 在 3000 终止 TLS → 反代到 `127.0.0.1:3002`**；3001 只负责 301 跳到
   `https://域名:3000`。模板见 `deploy/nginx-teyvat-transit.conf`，原理与排查见 `HTTPS.md`。
   别照抄网上 `listen 443 ssl` + `proxy_pass http://127.0.0.1:3001` 的示例 —— 本方案里 3001 是跳转口，
   那样写只会 502。

   HTTPS 部署必须给服务加 `COOKIE_SECURE=1`（会话 Cookie 追加 Secure 标志）；明文 HTTP 访问时**不能**设，
   否则浏览器会丢弃 Cookie，表现为「登录没反应」。

4. **防火墙**：只放行你实际用的端口（本方案是 3000/3001）；**3002 不要暴露公网**，后端只 bind `127.0.0.1`。

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
> `cd /opt/TU && sudo git pull --ff-only && sudo bash -c 'cd client && npm ci && npm run build' && sudo pm2 restart teyvat-transit`

## 七、数据备份

数据全部在 `/opt/TU/server/data/`（`db.json`、`.jwt-secret`）和 `/opt/TU/server/uploads/`（图片）。
`deploy/update.sh` 每次更新前都会自动打包到 `/opt/tu-backups/`，另外建议加一条夜间备份：

```bash
sudo crontab -e
30 3 * * * cd /opt/TU && tar -czf /opt/tu-backups/nightly-$(date +\%F).tar.gz server/data server/uploads
```

恢复：

```bash
sudo tar -xzf /opt/tu-backups/data-<时间>.tar.gz -C /opt/TU && sudo pm2 restart teyvat-transit
```
