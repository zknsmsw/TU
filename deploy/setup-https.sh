#!/usr/bin/env bash
# ============================================================
#  提瓦特交通联合 · Ubuntu 26.04 部署脚本
#  （HTTPS 3000 / HTTP 3001 跳转 / DNS-01 阿里云 证书）
#
#  用法:  sudo ./setup-https.sh 你的域名 邮箱 [阿里云AccessKey ID] [AccessKey Secret]
#  示例:  sudo ./setup-https.sh train.example.com you@example.com LTAIxxxx Sxxxx
#  凭证也可通过环境变量 ALI_AK / ALI_SK 传入，或不传让脚本提示输入。
#
#  前提:  1) 域名托管在「阿里云云解析」，RAM 子账号 AccessKey 已授权 AliyunDNSFullAccess
#         2) 宽带是公网 IP，路由器已把 TCP 3000 和 3001 转发到本机内网 IP
#         3) 本压缩包已解压到 /opt（目录为 /opt/TU）
#
#  端口:  3000 = HTTPS（nginx 终止 TLS）   3001 = HTTP（301 跳 3000）   3002 = 后端（仅本机）
#  证书:  Let's Encrypt，DNS-01 验证（acme.sh 调阿里云 API 写 TXT 记录），完全不占用 80/443
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
ALI_AK="${3:-${ALI_AK:-}}"
ALI_SK="${4:-${ALI_SK:-}}"
APP_DIR="/opt/TU"
ACME="/root/.acme.sh/acme.sh"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

# ---------- 前置检查 ----------
if [ -z "$DOMAIN" ]; then
  echo "用法: sudo $0 你的域名 邮箱 [阿里云AK] [阿里云SK]"
  echo "示例: sudo $0 train.example.com you@example.com LTAIxxxx Sxxxx"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 运行: sudo $0 $DOMAIN"
  exit 1
fi
if [ ! -d "$APP_DIR/server" ]; then
  echo "未找到 $APP_DIR/server —— 请先把压缩包解压到 /opt（unzip 后目录应为 /opt/TU）"
  exit 1
fi

# 阿里云凭证：命令行参数 > 环境变量 > 交互输入
if [ -z "$ALI_AK" ]; then read -r -p "阿里云 AccessKey ID: " ALI_AK; fi
if [ -z "$ALI_SK" ]; then read -r -s -p "阿里云 AccessKey Secret（不回显）: " ALI_SK; echo; fi
if [ -z "$ALI_AK" ] || [ -z "$ALI_SK" ]; then
  echo "缺少阿里云凭证，终止。"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# ---------- 1. Node.js（低于 22 则用 NodeSource 装 22 LTS） ----------
if ! command -v node >/dev/null 2>&1; then
  echo "==> 安装 Node.js ..."
  apt-get update -qq
  apt-get install -y -qq nodejs || true
fi
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//; s/\..*$//' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  echo "==> 当前 Node $(node -v 2>/dev/null || echo 未安装) 过旧，改用 NodeSource 22 LTS ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "Node: $(node -v)"

# ---------- 2. nginx ----------
echo "==> 安装 nginx ..."
apt-get update -qq
apt-get install -y -qq nginx

# ---------- 3. 后端依赖 ----------
echo "==> 安装后端依赖（npm install --omit=dev）..."
cd "$APP_DIR/server"
npm install --omit=dev --registry=https://registry.npmmirror.com 2>/dev/null || npm install --omit=dev

# ---------- 4. acme.sh + 签发证书（DNS-01，不碰 80/443） ----------
if [ ! -f "$ACME" ]; then
  echo "==> 安装 acme.sh ..."
  if [ -n "$EMAIL" ]; then
    curl -fsSL https://get.acme.sh | sh -s email="$EMAIL"
  else
    curl -fsSL https://get.acme.sh | sh
  fi
fi
export Ali_Key="$ALI_AK"
export Ali_Secret="$ALI_SK"
echo "==> 通过阿里云 DNS 申请 Let's Encrypt 证书: $DOMAIN（约 1~2 分钟，需等 TXT 记录生效）..."
"$ACME" --issue --dns dns_ali -d "$DOMAIN" --server letsencrypt
mkdir -p "$CERT_DIR"
"$ACME" --install-cert -d "$DOMAIN" \
  --key-file "$CERT_DIR/privkey.pem" \
  --fullchain-file "$CERT_DIR/fullchain.pem" \
  --reloadcmd "systemctl reload nginx"

# ---------- 5. 写 Nginx 配置（3000 HTTPS / 3001 HTTP 跳转 → 后端 3002） ----------
echo "==> 写入 Nginx 反代配置 ..."
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx-teyvat-transit.conf" \
  > /etc/nginx/sites-available/teyvat-transit
ln -sf /etc/nginx/sites-available/teyvat-transit /etc/nginx/sites-enabled/teyvat-transit
rm -f /etc/nginx/sites-enabled/default

# 停掉可能占用 3000/3001/3002 的旧进程（例如之前用 nohup 起的后端）
echo "==> 清理旧进程（3000/3001/3002）..."
fuser -k 3000/tcp 3001/tcp 3002/tcp 2>/dev/null || true
sleep 1

nginx -t
systemctl enable nginx
systemctl restart nginx

# ---------- 6. 防火墙放行 3000/3001 ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "==> 放行 3000/3001（ufw）..."
  ufw allow 3000/tcp >/dev/null
  ufw allow 3001/tcp >/dev/null
fi

# ---------- 7. pm2 常驻 + 开机自启 ----------
echo "==> 配置 pm2 ..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
cd "$APP_DIR"
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
echo "==> 若上面 pm2 startup 输出过一条含 'systemctl enable' 的命令，请把它复制执行一次（开机自启）"

echo
echo "=========================================================="
echo "✅ 部署完成！访问: https://$DOMAIN:3000"
echo "   HTTP 入口会自动跳转: http://$DOMAIN:3001 → https://$DOMAIN:3000"
echo "   管理员初始密码：pm2 logs teyvat-transit 看启动日志（只显示一次）"
echo "   证书自动续期：acme.sh 已装 cron，每天检查，到期前自动续并重载 nginx"
echo "   常用命令：pm2 status / pm2 logs teyvat-transit / pm2 restart teyvat-transit"
echo "=========================================================="
