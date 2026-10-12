# 基于 git pull 的服务器部署（提瓦特交通联合）

适用：Ubuntu 26.04 家用服务器 · 公网 HTTPS · GitHub 直连（仓库公开）。
这套流程与旧的「打 zip + scp 覆盖」流程（见 `DEPLOY.md`）并存，互不冲突。

## 一、为什么不能照搬 zip 流程

`.gitignore` 忽略了三样东西，决定了 git 流程必须自己补上：

| 忽略项 | 后果 | 本流程的处理 |
|---|---|---|
| `client/dist/` | clone / pull 后**没有前端产物** | 服务器上 `npm run build`（每次更新都要） |
| `server/data/` | 数据库与 `.jwt-secret` 不在库里 | `git pull` 永不覆盖线上数据；更新前自动备份 |
| `node_modules/` | 平台相关，不能跨平台复用 | 服务器上 `npm ci` |

两个由代码决定的硬约束：

- `deploy/ecosystem.config.js` 的 `cwd` 写死为 `/opt/TU/server` → **必须 clone 到 `/opt/TU`**。
- `server/src/index.js` 只在**进程启动时**注册 `express.static(client/dist)`；因此更新顺序必须是
  **先构建前端、再重启进程**，否则页面能开但 `/assets/*` 全 404。`update.sh` 已固定该顺序。

## 二、首次部署

```bash
# 一条命令：clone → 装依赖 → 构建前端 → 跑现有 HTTPS 一键脚本（Node 22 / nginx / acme.sh / pm2）
sudo bash bootstrap.sh train.example.com you@example.com <阿里云AK> <阿里云SK>
```

`bootstrap.sh` 只做 git 流程特有的部分（clone + 前端构建），证书、Nginx、pm2、开机自启全部交给
仓库里已有的 `deploy/setup-https.sh`，不重复实现。也可以分两步：

```bash
sudo bash /opt/TU/deploy/bootstrap.sh              # 只准备代码
sudo bash /opt/TU/deploy/setup-https.sh 域名 邮箱 AK SK
```

管理员初始密码只在 `pm2 logs teyvat-transit` 里出现一次；要固定就用 `ADMIN_PASSWORD`（≥8 位）。

## 三、从旧 zip 部署迁移（服务器上已有 `/opt/TU`）

`server/data`、`server/uploads` 不在版本库，可以整目录搬过去：

```bash
sudo mv /opt/TU /opt/TU.old                  # 旧目录先挪走（里面有 zip 部署的代码和数据）
sudo git clone https://github.com/zknsmsw/TU.git /opt/TU
sudo cp -a /opt/TU.old/server/data    /opt/TU/server/data
sudo cp -a /opt/TU.old/server/uploads /opt/TU/server/uploads 2>/dev/null || true
sudo chown -R root:root /opt/TU
sudo bash /opt/TU/deploy/update.sh           # 装依赖 + 构建 + 重启 + 自检

# 确认线上数据无误后再删旧目录
sudo rm -rf /opt/TU.old
```

确认 pm2 里没有旧进程残留：`pm2 list`（同为 root 用户执行，避免开出第二个 pm2 守护进程）。

## 四、日常更新 / 回滚

```bash
sudo bash /opt/TU/deploy/update.sh                    # 备份 → git pull --ff-only → 按需 npm ci → 构建 → 重启 → /api/health 自检
sudo bash /opt/TU/deploy/update.sh --rollback <ref>   # 回到某个提交/标签（同样会备份、构建、重启）
```

线上发版流程不变：**本地 `git commit && git push` → 服务器 `update.sh`**。
`--ff-only` 是刻意的：服务器上若有未提交改动或历史分叉，直接报错退出，而不是覆盖文件。

可覆盖的环境变量：`APP_DIR` `BRANCH` `PM2_NAME` `BACKUP_DIR` `KEEP_BACKUPS`(默认留 30 份)
`NPM_REGISTRY` `HEALTH_URL`。

回滚后处于 detached HEAD，恢复主线：

```bash
cd /opt/TU && sudo git checkout main && sudo git pull --ff-only && sudo bash deploy/update.sh
```

## 五、数据与安全铁律

- **绝不在服务器上执行 `git clean -fd`、`git reset --hard`、`git checkout .`** —— 会删掉/回滚
  `server/data`（全部订单与账号）。`update.sh` 只做快进合并，就是为了杜绝这一点。
- 唯一需要备份的是 `server/data` 与 `server/uploads`；`update.sh` 每次都自动打包到 `/opt/tu-backups`。
  建议再加一条夜间备份：
  ```bash
  sudo crontab -e
  30 3 * * * cd /opt/TU && tar -czf /opt/tu-backups/nightly-$(date +\%F).tar.gz server/data server/uploads
  ```
- 手工恢复：`sudo tar -xzf /opt/tu-backups/data-<时间>.tar.gz -C /opt/TU && pm2 restart teyvat-transit`
- `update.sh` 必须用**与 pm2 相同的用户**执行（`setup-https.sh` 以 root 起 pm2，所以就用 root），
  否则会起出第二个 pm2 守护进程、端口 3002 冲突。
- `.jwt-secret` 丢失只会让所有人重新登录，数据不受影响；想固定就设 `JWT_SECRET`（≥32 位）。
- 权限收紧：`sudo chmod -R o-w /opt/TU && sudo chmod 600 /opt/TU/server/data/*`。

## 六、排错

| 现象 | 原因 / 处理 |
|---|---|
| `detected dubious ownership in repository` | `git config --global --add safe.directory /opt/TU`（`bootstrap.sh` 已自动加） |
| 页面能开但 `/assets/*` 404、样式丢失 | 构建后没有重启进程 → `pm2 restart teyvat-transit` |
| 页面显示「请先运行 npm run build」 | `client/dist` 不存在 → `cd /opt/TU/client && npm run build` |
| 登录成功但立刻掉线 | `COOKIE_SECURE=1` 却用 `http://` 访问 → 全程走 `https://域名:3000`（内网明文访问则去掉该变量） |
| `git pull` 报 diverged / 拒绝快进 | 服务器上有人改过仓库内文件 → `git status` 查清后手工处理，**不要** `reset --hard` |
| `npm ci` 卡住或超时 | `NPM_REGISTRY=https://registry.npmmirror.com sudo -E bash deploy/update.sh` |
| clone/pull 连不上 GitHub | 加代理 `sudo -E git -c http.proxy=http://127.0.0.1:7890 pull`，或改用内网裸仓库方案 |
| 3000/3001 打不开 | 路由器未转发、宽带是 CGNAT、或 ufw 未放行 → 见 `deploy/README.md` 与 `HTTPS.md` |
| 上传宣传图 413 | Nginx `client_max_body_size 16m`（`deploy/nginx-teyvat-transit.conf` 已含） |

脚本自身的验收测试：`cd server && npm test`（`server/test/deployScripts.test.js` 校验脚本语法契约、
备份存在、构建早于重启、且不得出现会删数据的危险命令）。
