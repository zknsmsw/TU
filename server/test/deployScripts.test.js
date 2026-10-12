// 部署脚本契约测试：校验 deploy/update.sh 的安全性不变量。
// 不做任何子进程调用，任何平台上都能真实运行。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', '..', 'deploy', 'update.sh');
const src = fs.readFileSync(SCRIPT, 'utf8');

// 服务器上 server/data（订单、账号）不在版本库，这些命令会直接删掉或回滚它
const FORBIDDEN = [
  { re: /\bgit\s+clean\b/, why: 'git clean 会删除未跟踪的 server/data、uploads' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard 会回滚工作区' },
  { re: /\bgit\s+checkout\s+\.\s*$/m, why: 'git checkout . 会丢弃工作区改动' },
  { re: /\brm\s+-rf\s+(\/opt\/TU|\$APP_DIR)\b/, why: '不得递归删除部署目录' }
];

test('update.sh：bash 头部与基本结构', () => {
  assert.match(src, /^#!\/usr\/bin\/env bash\n/, '缺少 bash shebang');
  assert.match(src, /^set -euo pipefail$/m, '必须 set -euo pipefail');
  assert.match(src, /git rev-parse --git-dir/, '必须校验是 git 工作副本');
  assert.match(src, /\[ -d server \] && \[ -d client \]/, '必须校验目录结构');
});

test('update.sh：不得出现会删掉线上数据的命令', () => {
  for (const { re, why } of FORBIDDEN) {
    assert.ok(!re.test(src), `出现危险命令 ${re}：${why}`);
  }
});

test('update.sh：先备份、再拉取，且只允许快进合并', () => {
  const backup = src.indexOf('tar -czf "$BACKUP_FILE" server/data server/uploads');
  const merge = src.indexOf('git merge --ff-only');
  assert.ok(backup > -1, '必须先打包 server/data 与 server/uploads');
  assert.ok(merge > -1, '只允许快进合并');
  assert.ok(backup < merge, '备份必须发生在取代码之前');
  assert.match(src, /git fetch origin "\$BRANCH"/, '应拉取指定分支');
});

test('update.sh：构建前端必须早于重启进程（否则 /assets/* 404）', () => {
  const build = src.indexOf('npm run build');
  const restart = src.indexOf('pm2 restart');
  assert.ok(build > -1 && restart > -1, '缺少构建或重启步骤');
  assert.ok(build < restart, 'npm run build 必须出现在 pm2 restart 之前');
  assert.match(src, /client\/dist\/index\.html/, '构建后必须校验产物存在');
});

test('update.sh：依赖按需安装，镜像失败可回退官方源', () => {
  assert.match(src, /npm_ci\(\)/, '应封装 npm_ci 助手');
  assert.match(src, /npm ci --omit=dev/, '后端用 npm ci --omit=dev');
  assert.match(src, /changed server\/package\.json server\/package-lock\.json/, '应比较 lock 决定是否重装');
  assert.match(src, /changed client\/package\.json client\/package-lock\.json/, '前端同样按需重装');
  assert.match(src, /--registry="\$NPM_REGISTRY"/, '镜像应可通过变量指定');
});

test('update.sh：回滚同样先备份，且能回到主线', () => {
  assert.match(src, /--rollback/, '应支持 --rollback <ref>');
  assert.match(src, /git checkout "\$REF"/, '回滚应 checkout 指定 ref');
  assert.ok(
    src.indexOf('tar -czf "$BACKUP_FILE"') < src.indexOf('git checkout "$REF"'),
    '回滚也要先备份'
  );
  assert.match(src, /git checkout \$BRANCH/, '应提示如何回到主线');
});

test('update.sh：重启后做健康检查', () => {
  assert.match(src, /HEALTH_URL/, '应可配置健康检查地址');
  assert.match(src, /curl -fsS --max-time 3 "\$HEALTH_URL"/, '应轮询 /api/health 确认服务可用');
  assert.match(src, /pm2 restart "\$PM2_NAME" --update-env/, '更新后要重启 pm2 进程');
});
