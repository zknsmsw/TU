const { verifyToken, readAuthToken } = require('./auth');
const db = require('./db');

// 需要登录
function requireAuth(req, res, next) {
  const token = readAuthToken(req);
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
  const user = db.load().users.find((u) => u.id === payload.id);
  if (!user) {
    return res.status(401).json({ code: 401, message: '用户不存在' });
  }
  // token 版本校验：修改密码后旧令牌立即失效
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
    return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' });
  }
  req.user = user;
  next();
}

// 需要管理员
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权限' });
    }
    // 初始管理员必须先修改默认/初始密码才能使用后台
    if (req.user.mustChangePassword) {
      return res.status(403).json({ code: 403, message: '管理员首次登录请先修改密码' });
    }
    next();
  });
}

// ---------- 简单的内存限速器（零依赖） ----------
// 固定窗口计数，窗口到期自动清理，防止内存无限增长。
function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> { count, resetAt }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }, Math.max(windowMs, 60000));
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      const retryAfter = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ code: 429, message: message || '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, createRateLimiter };
