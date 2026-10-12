#!/usr/bin/env bash
# ============================================================
#  提瓦特交通联合 · 服务器更新（git pull 流程）
#
#  用法:
#    sudo bash /opt/TU/deploy/update.sh                  正常更新到 origin/main
#    sudo bash /opt/TU/deploy/update.sh --rollback <ref>  回滚到指定提交/标签
#
#  环境变量覆盖: APP_DIR / BRANCH / PM2_NAME / BACKUP_DIR / KEEP_BACKUPS
#                NPM_REGISTRY / HEALTH_URL
#
#  顺序不可颠倒：client/dist 不在版本库，且 server/src/index.js 只在启动时
#  注册 express.static —— 必须先构建、后重启，否则 /assets/* 会 404。
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/TU}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-teyvat-transit}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tu-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"
NPM_REGISTRY="${NPM_REGISTRY:-}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3002/api/health}"

MODE="update"
REF=""
if [ "${1:-}" = "--rollback" ]; then
  MODE="rollback"
  REF="${2:-}"
  [ -n "$REF" ] || { echo "用法: $0 --rollback <提交或标签>" >&2; exit 2; }
elif [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,14p' "$0"; exit 0
fi

log() { echo "[$(date '+%F %T')] $*"; }
die() { echo "[错误] $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "未安装 git"
command -v node >/dev/null 2>&1 || die "未安装 Node.js"
command -v npm >/dev/null 2>&1 || die "未安装 npm"
command -v pm2 >/dev/null 2>&1 || die "未安装 pm2（sudo npm i -g pm2）"
command -v curl >/dev/null 2>&1 || die "未安装 curl"

cd "$APP_DIR" 2>/dev/null || die "目录不存在：$APP_DIR"
git rev-parse --git-dir >/dev/null 2>&1 || die "$APP_DIR 不是 git 工作副本（首次部署见 deploy/GIT_DEPLOY.md）"
[ -d server ] && [ -d client ] || die "$APP_DIR 结构异常：缺少 server/ 或 client/"

cd "$APP_DIR"

# npm ci：优先用指定镜像，失败再退回官方源
npm_ci() {
  local dir="$1"; shift
  if [ -n "$NPM_REGISTRY" ]; then
    ( cd "$dir" && npm ci "$@" --registry="$NPM_REGISTRY" ) && return 0
    log "      镜像 $NPM_REGISTRY 失败，改用官方源重试"
  fi
  ( cd "$dir" && npm ci "$@" )
}

# ---------- 1. 备份数据（server/data 与 server/uploads 不在版本库） ----------
log "[1/5] 备份 server/data 与 server/uploads → $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/data-$(date '+%F-%H%M%S').tar.gz"
tar -czf "$BACKUP_FILE" server/data server/uploads 2>/dev/null || true
log "      $BACKUP_FILE"
ls -1t "$BACKUP_DIR"/data-*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

# ---------- 2. 取代码 ----------
PREV="$(git rev-parse HEAD)"
if [ "$MODE" = "rollback" ]; then
  log "[2/5] 回滚：fetch 后 checkout $REF（当前 $(git rev-parse --short HEAD)）"
  git fetch origin --tags
  git checkout "$REF"
else
  log "[2/5] 快进合并 origin/$BRANCH（当前 $(git rev-parse --short HEAD)）"
  git fetch origin "$BRANCH"
  # --ff-only：服务器上若有未提交改动或分叉，直接失败退出，绝不覆盖线上文件
  git merge --ff-only "origin/$BRANCH"
fi
NEW="$(git rev-parse HEAD)"
TARGET="$NEW"
[ "$MODE" = "rollback" ] && TARGET="$PREV"

# ---------- 3. 依赖 ----------
changed() { ! git diff --quiet "$PREV" "$NEW" -- "$@"; }
log "[3/5] 依赖"
if [ "$MODE" = "rollback" ] || [ ! -d server/node_modules ] || changed server/package.json server/package-lock.json; then
  log "      后端：npm ci --omit=dev"
  npm_ci server --omit=dev
else
  log "      后端：无变化，跳过"
fi
if [ "$MODE" = "rollback" ] || [ ! -d client/node_modules ] || changed client/package.json client/package-lock.json; then
  log "      前端：npm ci"
  npm_ci client
else
  log "      前端：无变化，跳过"
fi

# ---------- 4. 构建前端 ----------
log "[4/5] 构建前端（client/dist 不在版本库，每次都要构建）"
( cd client && npm run build )
[ -f client/dist/index.html ] || die "构建未产出 client/dist/index.html"

# ---------- 5. 重启 + 自检 ----------
log "[5/5] 重启 pm2 进程 $PM2_NAME"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  log "      进程不存在，按 deploy/ecosystem.config.js 启动"
  pm2 start "$APP_DIR/deploy/ecosystem.config.js"
fi
pm2 save >/dev/null

for i in $(seq 1 20); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "      健康检查通过：$HEALTH_URL"
    break
  fi
  [ "$i" -eq 20 ] && die "健康检查失败：$HEALTH_URL —— 看 pm2 logs $PM2_NAME"
  sleep 1
done

log "完成：$(git rev-parse --short "$PREV") → $(git rev-parse --short "$NEW")"
if [ "$MODE" = "rollback" ]; then
  log "当前处于 detached HEAD（回滚态）。恢复主线：cd $APP_DIR && git checkout $BRANCH && git pull --ff-only"
  [ -n "$TARGET" ] && log "如需再次回滚到该状态：git checkout $(git rev-parse --short HEAD)"
fi
