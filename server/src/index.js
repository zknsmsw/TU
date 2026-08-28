const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./db');
const { hashPassword } = require('./auth');
const { createRateLimiter } = require('./middleware');
const authRoutes = require('./routes/auth');

const app = express();
// 部署在 Nginx 反向代理之后：限速等逻辑按真实客户端 IP 生效（默认只允许本机反代连接，见下方 listen）
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');

// CORS：默认仅同源（本服务同时托管前端与 /api），禁止跨域读取；
// 需要跨域时通过环境变量 CORS_ORIGIN 白名单（逗号分隔）显式开启。
function corsConfig() {
  const list = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return { origin: false };
  return { origin: list, credentials: true };
}
app.use(cors(corsConfig()));

app.use(express.json({ limit: '15mb' })); // 15MB：允许上传 base64 编码的宣传图

// ---------- 安全响应头 ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// ---------- 限速 ----------
// 全局 API 限速（缓解大请求体/高频请求的资源耗尽风险）
app.use('/api', createRateLimiter({ windowMs: 60 * 1000, max: 300, message: '请求过于频繁，请稍后再试' }));
// 认证接口更严格
app.use('/api/auth/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: '尝试次数过多，请稍后再试' }));
app.use('/api/auth/register', createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: '注册过于频繁，请稍后再试' }));
app.use('/api/auth/change-password', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: '尝试次数过多，请稍后再试' }));

// 初始化数据 + 管理员账号（不再使用硬编码默认密码）
function randomPassword(len) {
  // 去掉易混淆字符，字母+数字混合
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function seed() {
  const d = db.load();
  const admin = d.users.find((u) => u.username === 'admin');
  if (!admin) {
    const envPwd = process.env.ADMIN_PASSWORD;
    const pwd = envPwd && envPwd.length >= 8 ? envPwd : randomPassword(12);
    d.users.push({
      id: db.nextId('users'),
      username: 'admin',
      passwordHash: hashPassword(pwd),
      role: 'admin',
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    });
    db.save();
    if (envPwd) {
      console.log('已创建管理员账号 admin（密码取自环境变量 ADMIN_PASSWORD），首次登录需修改密码。');
    } else {
      console.log('已创建管理员账号 admin，初始密码（仅显示这一次，登录后请立即修改）：' + pwd);
    }
  } else if (admin.mustChangePassword === undefined) {
    // 旧版本数据迁移：强制管理员修改一次密码，消除历史默认口令（admin123）风险
    admin.mustChangePassword = true;
    db.save();
    console.warn('[安全] 检测到旧版管理员账号，已强制其下次登录后修改密码。');
  }
}
seed();

// API 路由
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { time: new Date().toISOString() } });
});

// 宣传图：上传目录静态托管 + 接口
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/train', require('./routes/train'));
app.use('/api/hs', require('./routes/hs'));
app.use('/api/flight', require('./routes/flight'));
app.use('/api/orders', require('./routes/orders'));

// 静态资源：前端构建产物（client/dist）
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// SPA 回退：非 /api 的 GET 请求一律返回 index.html（支持前端路由刷新）
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  const indexFile = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res
    .status(200)
    .send('提瓦特交通联合 · 后端已启动。<br/>请先在项目根目录运行 <code>npm run build</code> 构建前端。');
});

// 未知 API
app.use('/api', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 统一 JSON 错误处理（不泄漏堆栈）
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ code: 400, message: '请求体不是有效的 JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, message: '请求体过大' });
  }
  console.error('[错误]', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('提瓦特交通联合后端已启动：http://localhost:' + PORT);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用：可能有一个旧的服务进程还在运行。');
    console.error('请先关闭旧的服务（关掉运行网站的命令行窗口，或在任务管理器里结束 Node.js 进程），再重新 npm start。');
  } else {
    console.error('服务启动失败：' + err.message);
  }
  process.exit(1);
});
