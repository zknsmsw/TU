#!/usr/bin/env bash
# ============================================================
#  提瓦特交通联合 · 服务器首次部署（git clone 流程）
#
#  用法:
#    sudo bash bootstrap.sh                           只准备代码（clone + 装依赖 + 构建前端）
#    sudo bash bootstrap.sh 域名 邮箱 阿里云AK 阿里云SK  接着自动跑 deploy/setup-https.sh
#
#  说明：仓库忽略 client/dist 与 server/data，clone 后没有前端产物，
#        必须先在服务器上构建；HTTPS 部分完全复用现有 deploy/setup-https.sh。
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/TU}"
REPO_URL="${REPO_URL:-https://github.com/zknsmsw/TU.git}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

[ "$(id -u)" -eq 0 ] || { echo "请用 root 运行：sudo bash $0 $*" >&2; exit 1; }

log() { echo "==> $*"; }

# ---------- 1. git ----------
if ! command -v git >/dev/null 2>&1; then
  log "安装 git"
  apt-get update -qq && apt-get install -y -qq git
fi

# ---------- 2. clone ----------
if [ -d "$APP_DIR/.git" ]; then
  log "$APP_DIR 已是 git 工作副本，跳过 clone"
elif [ -e "$APP_DIR" ]; then
  echo "[错误] $APP_DIR 已存在且不是 git 工作副本（旧的 zip 部署？）" >&2
  echo "        迁移办法见 deploy/GIT_DEPLOY.md「从旧 zip 部署迁移」一节。" >&2
  exit 1
else
  log "git clone $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# 避免 "detected dubious ownership"（root 操作非 root 属主目录时必现）
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$APP_DIR" \
  || git config --global --add safe.directory "$APP_DIR"

# ---------- 3. 后端依赖 ----------
log "后端依赖：npm ci --omit=dev"
( cd server && npm ci --omit=dev --registry="$NPM_REGISTRY" 2>/dev/null || npm ci --omit=dev )

# ---------- 4. 前端依赖 + 构建 ----------
log "前端依赖 + 构建"
( cd client && { npm ci --registry="$NPM_REGISTRY" 2>/dev/null || npm ci; } && npm run build )
[ -f client/dist/index.html ] || { echo "[错误] 前端构建失败" >&2; exit 1; }

log "代码就绪：$APP_DIR（client/dist 已生成）"

# ---------- 5. 交给现有的 HTTPS 一键脚本 ----------
if [ "$#" -ge 2 ]; then
  log "继续执行 deploy/setup-https.sh $1 $2"
  exec bash "$APP_DIR/deploy/setup-https.sh" "$@"
fi

cat <<EOF

下一步（HTTPS 一键部署：Node 22 LTS + nginx + acme.sh + 阿里云 DNS-01 证书 + pm2 开机自启）：

  sudo bash $APP_DIR/deploy/setup-https.sh 你的域名 你的邮箱 阿里云AK 阿里云SK

日常更新：sudo bash $APP_DIR/deploy/update.sh
EOF
