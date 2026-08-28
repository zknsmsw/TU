// 密码哈希（scrypt，Node 内置）与 JWT 签发/校验
// JWT 密钥：优先取环境变量 JWT_SECRET；未设置时使用首次启动生成的随机密钥文件
// （server/data/.jwt-secret，已被 .gitignore 排除），绝不使用硬编码默认值。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_EXPIRES_IN = '7d';
const JWT_ALGORITHM = 'HS256';

function loadSecret() {
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      console.warn('[安全] 环境变量 JWT_SECRET 过短（<32 字符），建议使用 64 位随机字符串。');
    }
    return process.env.JWT_SECRET;
  }
  const dir = path.join(__dirname, '..', 'data');
  const file = path.join(dir, '.jwt-secret');
  try {
    if (fs.existsSync(file)) {
      const s = fs.readFileSync(file, 'utf-8').trim();
      if (s) return s;
    }
  } catch (e) {
    console.error('[安全] 读取 JWT 密钥文件失败：' + e.message);
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, secret, { encoding: 'utf-8', mode: 0o600 });
    console.warn(
      '[安全] 未设置 JWT_SECRET 环境变量，已生成随机密钥并保存到 server/data/.jwt-secret（请勿提交到版本库）。'
    );
  } catch (e) {
    console.error('[安全] 写入 JWT 密钥文件失败：' + e.message);
  }
  return secret;
}

const JWT_SECRET = loadSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch (e) {
    return false;
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
  );
}

function verifyToken(token) {
  // 固定算法 HS256，防止算法混淆攻击
  return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
}

// ---------- HttpOnly Cookie 会话 ----------
// 令牌只放在 HttpOnly Cookie 里，前端 JS 无法读取，XSS 无法窃取登录态。
const COOKIE_NAME = 'tt_token';
const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 天，与 JWT 有效期一致

function setAuthCookie(res, token) {
  const attrs = ['HttpOnly', 'SameSite=Lax', `Max-Age=${COOKIE_MAX_AGE}`, 'Path=/'];
  // 部署到 HTTPS 时设置 COOKIE_SECURE=1 追加 Secure 标志
  if (process.env.COOKIE_SECURE === '1') attrs.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs.join('; ')}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function readAuthToken(req) {
  // 优先 Authorization: Bearer（兼容脚本/测试），否则读 HttpOnly Cookie
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const cookies = req.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  readAuthToken
};
