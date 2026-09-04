const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/auth');

// 密码哈希：正常 + 边界 + 异常
test('密码哈希与校验（正确/错误）', () => {
  const pwd = 'my-secret-123456';
  const h = hashPassword(pwd);
  assert.ok(h.includes(':'), '哈希应包含 盐:hash 分隔符');
  assert.strictEqual(verifyPassword(pwd, h), true, '正确密码应通过');
  assert.strictEqual(verifyPassword('wrong-password', h), false, '错误密码应失败');
  // 两次哈希应不同（随机盐）
  assert.notStrictEqual(hashPassword(pwd), hashPassword(pwd), '随机盐应产生不同哈希');
});

test('校验非法存储格式应安全返回 false', () => {
  assert.strictEqual(verifyPassword('x', ''), false, '空存储应失败');
  assert.strictEqual(verifyPassword('x', 'not-a-valid-hash'), false, '非法格式应失败');
  assert.strictEqual(verifyPassword('x', 'a:b'), false, '长度不符应失败');
});

// JWT：签发 + 校验 往返
test('JWT 签发后应能校验并还原 payload', () => {
  const user = { id: 7, username: 'alice', role: 'admin', tokenVersion: 0 };
  const token = signToken(user);
  const payload = verifyToken(token);
  assert.strictEqual(payload.id, 7);
  assert.strictEqual(payload.username, 'alice');
  assert.strictEqual(payload.role, 'admin');
});

test('被篡改的 token 应校验失败', () => {
  const token = signToken({ id: 1, username: 'bob', role: 'user', tokenVersion: 0 });
  const tampered = token.slice(0, -4) + 'XXXX'; // 动最后 4 个字符
  assert.throws(() => verifyToken(tampered), '篡改 token 应抛错');
});
