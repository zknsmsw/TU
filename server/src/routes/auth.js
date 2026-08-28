const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie } = require('../auth');
const { requireAuth } = require('../middleware');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    mustChangePassword: !!u.mustChangePassword
  };
}

// ---------- 登录失败锁定（内存态） ----------
const lockouts = new Map(); // `${ip}:${username}` -> { fails, lockedAt, expireAt }
const MAX_FAILS = 5; // 窗口内连续失败 5 次锁定
const LOCK_MS = 15 * 60 * 1000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of lockouts) {
    if (v.expireAt <= now) lockouts.delete(k);
  }
}, 60 * 1000);
if (sweep.unref) sweep.unref();

function lockKey(req, username) {
  return (req.ip || '?') + ':' + String(username || '').toLowerCase();
}

// 仅在触发锁定后返回 true（lockedAt 有值且未过期）
function isLocked(req, username) {
  const rec = lockouts.get(lockKey(req, username));
  return !!rec && rec.lockedAt > Date.now();
}

// 记录一次失败；达到阈值时触发锁定并返回 true
function recordFailure(req, username) {
  const key = lockKey(req, username);
  const now = Date.now();
  const rec = lockouts.get(key);
  if (!rec || rec.expireAt <= now) {
    lockouts.set(key, { fails: 1, lockedAt: 0, expireAt: now + LOCK_MS });
    return false;
  }
  rec.fails += 1;
  if (rec.fails >= MAX_FAILS) {
    rec.lockedAt = now + LOCK_MS;
    rec.expireAt = now + LOCK_MS;
    return true; // 本次起锁定
  }
  return false;
}

function clearFailures(req, username) {
  lockouts.delete(lockKey(req, username));
}

// 注册
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const pwd = String(password || '');

  // 所有失败场景返回同一提示，避免用户名枚举
  if (!name || !pwd || name.length < 2 || name.length > 20 || pwd.length < 6) {
    return res.status(400).json({ code: 400, message: '注册失败，请检查用户名（2~20 字符）和密码（至少 6 位）' });
  }

  const d = db.load();
  if (d.users.some((u) => u.username === name)) {
    return res.status(400).json({ code: 400, message: '注册失败，请检查用户名（2~20 字符）和密码（至少 6 位）' });
  }

  const user = {
    id: db.nextId('users'),
    username: name,
    passwordHash: hashPassword(pwd),
    role: 'user',
    tokenVersion: 0,
    createdAt: new Date().toISOString()
  };
  d.users.push(user);
  db.save();

  setAuthCookie(res, signToken(user));
  res.json({ code: 0, message: '注册成功', data: { user: publicUser(user) } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();

  if (isLocked(req, name)) {
    return res.status(429).json({ code: 429, message: '尝试次数过多，账号已临时锁定，请 15 分钟后再试' });
  }

  const d = db.load();
  const user = d.users.find((u) => u.username === name);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    if (recordFailure(req, name)) {
      return res.status(429).json({ code: 429, message: '尝试次数过多，账号已临时锁定，请 15 分钟后再试' });
    }
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }

  clearFailures(req, name);
  setAuthCookie(res, signToken(user));
  res.json({ code: 0, message: '登录成功', data: { user: publicUser(user) } });
});

// 退出登录（清除会话 Cookie）
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ code: 0, message: '已退出登录' });
});

// 当前登录用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ code: 0, message: 'ok', data: { user: publicUser(req.user) } });
});

// 修改密码（需登录）
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const oldPwd = String(oldPassword || '');
  const newPwd = String(newPassword || '');

  if (!verifyPassword(oldPwd, req.user.passwordHash)) {
    return res.status(400).json({ code: 400, message: '原密码不正确' });
  }
  if (newPwd.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少 6 位' });
  }
  if (oldPwd === newPwd) {
    return res.status(400).json({ code: 400, message: '新密码不能与原密码相同' });
  }

  const d = db.load();
  const user = d.users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }
  user.passwordHash = hashPassword(newPwd);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // 使所有旧令牌立即失效
  user.mustChangePassword = false;
  db.save();

  clearAuthCookie(res); // 服务端同步清除会话 Cookie
  res.json({ code: 0, message: '密码修改成功，请重新登录' });
});

module.exports = router;
