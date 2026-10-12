// 部署脚本契约测试：校验 deploy/ 下的 git 部署脚本与文档符合安全/顺序约定。
// 只做静态断言（不 spawn 子进程），因此在任何平台上都能真实运行。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEPLOY_DIR = path.join(__dirname, '..', '..', 'deploy');
const read = (name) => fs.readFileSync(path.join(DEPLOY_DIR, name), 'utf8');

const SCRIPTS = ['update.sh', 'bootstrap.sh'];

// 任何会干掉线上数据（server/data 不在版本库）的命令都不允许出现在更新脚本里
const FORBIDDEN = [
  { re: /\bgit\s+clean\b/, why: 'git clean 会删除未跟踪的 server/data、uploads' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard 会回滚工作区' },
  { re: /\bgit\s+checkout\s+\.\s*$/m, why: 'git checkout . 会丢弃工作区改动' },
  { re: /\brm\s+-rf\s+(\/opt\/TU|\$APP_DIR)\b/, why: '不得递归删除部署目录' }
];

test('两个脚本存在、非空、且带正确的 bash 头部', () => {
  for (const name of SCRIPTS) {
    const file = path.join(DEPLOY_DIR, name);
    assert.ok(fs.existsSync(file), `${name} 应存在`);
    const src = read(name);
    assert.ok(src.length > 500, `${name} 内容过短，疑似占位文件`);
    assert.match(src, /^#!\/usr\/bin\/env bash\n/, `${name} 缺少 bash shebang`);
    assert.match(src, /^set -euo pipefail$/m, `${name} 必须 set -euo pipefail`);
  }
});

test('脚本不得包含会破坏线上数据的命令', () => {
  for (const name of SCRIPTS) {
    const src = read(name);
    for (const { re, why } of FORBIDDEN) {
      assert.ok(!re.test(src), `${name} 出现危险命令 ${re}：${why}`);
    }
  }
});

test('update.sh：更新前备份，且只做快进合并', () => {
  const src = read('update.sh');
  assert.match(src, /tar -czf "\$BACKUP_FILE" server\/data server\/uploads/, '必须先打包 server/data 与 server/uploads');
  assert.ok(
    src.indexOf('tar -czf "$BACKUP_FILE"') < src.indexOf('git merge --ff-only'),
    '备份必须发生在取代码之前'
  );
  assert.match(src, /git merge --ff-only/, '只允许快进合并');
  assert.match(src, /git fetch origin "\$BRANCH"/, '应拉取指定分支');
  assert.match(src, /pm2 restart "\$PM2_NAME" --update-env/, '更新后要重启 pm2 进程');
});

test('update.sh：构建前端必须早于重启进程（否则 /assets/* 404）', () => {
  const src = read('update.sh');
  const build = src.indexOf('npm run build');
  const restart = src.indexOf('pm2 restart');
  assert.ok(build > -1 && restart > -1, '缺少构建或重启步骤');
  assert.ok(build < restart, 'npm run build 必须出现在 pm2 restart 之前');
  assert.match(src, /client\/dist\/index\.html/, '构建后必须校验产物存在');
});

test('update.sh：支持回滚，且回滚同样先备份', () => {
  const src = read('update.sh');
  assert.match(src, /--rollback/, '应支持 --rollback <ref>');
  assert.match(src, /git checkout "\$REF"/, '回滚应 checkout 指定 ref');
  assert.ok(
    src.indexOf('tar -czf "$BACKUP_FILE"') < src.indexOf('git checkout "$REF"'),
    '回滚也要先备份'
  );
});

test('update.sh：依赖按需安装，并对镜像失败做回退', () => {
  const src = read('update.sh');
  assert.match(src, /npm ci --omit=dev/, '后端用 npm ci --omit=dev');
  assert.match(src, /npm ci/, '前端用 npm ci');
  assert.match(src, /npm_ci\(\)/, '应封装 npm_ci 助手');
  assert.match(src, /--registry="\$NPM_REGISTRY"/, '镜像应可通过变量指定');
  assert.match(src, /changed server\/package\.json/, '应比较 package-lock 决定是否重装依赖');
});

test('update.sh：重启后有健康检查', () => {
  const src = read('update.sh');
  assert.match(src, /HEALTH_URL/, '应可配置健康检查地址');
  assert.match(src, /curl -fsS --max-time 3 "\$HEALTH_URL"/, '应轮询 /api/health 确认服务可用');
});

test('update.sh：拒绝在不合规的目录执行', () => {
  const src = read('update.sh');
  assert.match(src, /git rev-parse --git-dir/, '必须校验是 git 工作副本');
  assert.match(src, /\[ -d server \] && \[ -d client \]/, '必须校验目录结构');
});

test('bootstrap.sh：clone 到 /opt/TU 并复用现有 HTTPS 脚本', () => {
  const src = read('bootstrap.sh');
  assert.match(src, /APP_DIR="\$\{APP_DIR:-\/opt\/TU\}"/, '默认目录必须是 /opt/TU（ecosystem.config.js 写死了该路径）');
  assert.match(src, /git clone "\$REPO_URL" "\$APP_DIR"/, '应 clone 仓库');
  assert.match(src, /safe\.directory/, '应处理 dubious ownership');
  const execLine = 'exec bash "$APP_DIR/deploy/setup-https.sh" "$@"';
  assert.ok(src.includes(execLine), '应把域名等参数透传给 setup-https.sh');
  assert.ok(
    src.indexOf('npm run build') < src.indexOf(execLine),
    '必须先构建前端，再交给 setup-https.sh 启 pm2'
  );
});

test('bootstrap.sh：已存在的非 git 目录要报错退出而不是覆盖', () => {
  const src = read('bootstrap.sh');
  assert.match(src, /elif \[ -e "\$APP_DIR" \]/, '应检测同名非 git 目录');
  assert.match(src, /exit 1/, '检测到旧 zip 部署时必须退出，交由人工迁移');
});

test('GIT_DEPLOY.md：覆盖首次部署、更新回滚与数据铁律', () => {
  const doc = read('GIT_DEPLOY.md');
  for (const kw of ['bootstrap.sh', 'update.sh', '--rollback', 'git clean', 'server/data', '/opt/TU']) {
    assert.ok(doc.includes(kw), `文档应说明 ${kw}`);
  }
});
