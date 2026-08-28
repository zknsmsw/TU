# Linux 服务器部署指南（teyvat-transit）

本包已包含：后端源码、前端构建产物（client/dist，无需再构建）、全部数据（server/data、server/uploads）。
不含 node_modules（Windows 平台二进制不可跨平台使用，需在服务器上重新安装）。

## 一、服务器安装 Node.js（LTS 22 或 24）

Ubuntu/Debian：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应显示 v22.x
```

其他系统（CentOS/Rocky 用 dnf、或用 nvm）请参照 nodejs.org 官方文档。

## 二、上传并解压

在 Windows 上把 `teyvat-transit.zip` 传到服务器（任选其一）：

```bash
# 方式一：scp
scp C:\Users\MI\Desktop\teyvat-transit.zip 用户名@服务器IP:/opt/

# 方式二：rsync（可增量同步整个目录）
rsync -avz --exclude node_modules --exclude .npm-cache /c/Users/MI/Desktop/TU/ 用户名@服务器IP:/opt/TU/
```

服务器上解压：

```bash
cd /opt
unzip teyvat-transit.zip      # 得到 /opt/TU 目录
```

## 三、安装后端依赖（只需 server 的，纯 JS 依赖很快）

```bash
cd /opt/TU/server
npm install --omit=dev
```

> 如果服务器无法直连 npm 官方源（国内服务器），可加镜像：
> `npm install --omit=dev --registry=https://registry.npmmirror.com`

## 四、启动

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

## 六、升级 / 更新

以后改了代码：在 Windows 上重新 `npm run build`，然后把改动文件（server/src、client/dist、server/uploads）rsync 到服务器，重启服务：

```bash
pm2 restart teyvat-transit   # 或 kill 掉 nohup 进程重新 npm start
```

## 七、数据备份

数据全部在 `/opt/TU/server/data/`（db.json）和 `/opt/TU/server/uploads/`（图片）。
定期打包备份：

```bash
cd /opt/TU && tar -czf backup-$(date +%F).tar.gz server/data server/uploads
```
