const test = require('node:test');
const assert = require('node:assert');
const { validateText, createNotice, removeById, MAX_TEXT_LENGTH } = require('../src/footerNotices');

// ---------- validateText：正常路径 ----------
test('合法声明文本应返回去除首尾空白后的内容', () => {
  const r = validateText('  本网站仅为虚构项目  ');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value, '本网站仅为虚构项目');
});

// ---------- validateText：边界 ----------
test('恰好等于字数上限的声明应通过', () => {
  const text = '字'.repeat(MAX_TEXT_LENGTH);
  const r = validateText(text);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value, text);
});

test('超过字数上限的声明应被拒绝', () => {
  const r = validateText('字'.repeat(MAX_TEXT_LENGTH + 1));
  assert.strictEqual(r.ok, false);
  assert.ok(r.message.includes('不能超过'));
});

// ---------- validateText：异常 / 非法输入 ----------
test('非字符串声明应被拒绝', () => {
  assert.strictEqual(validateText(undefined).ok, false);
  assert.strictEqual(validateText(123).ok, false);
  assert.strictEqual(validateText({}).ok, false);
});

test('空白或空字符串声明应被拒绝', () => {
  assert.strictEqual(validateText('').ok, false);
  assert.strictEqual(validateText('   ').ok, false);
});

// ---------- createNotice：正常 + 非法 ----------
test('createNotice 应生成带 id 与时间的声明条目', () => {
  const r = createNotice('  新声明  ');
  assert.ok(r.notice, '应成功创建');
  assert.strictEqual(r.notice.text, '新声明');
  assert.ok(r.notice.id, '应生成 id');
  assert.ok(!Number.isNaN(Date.parse(r.notice.createdAt)), 'createdAt 应为合法时间');
});

test('createNotice 对非法文本应返回 error', () => {
  const r = createNotice('');
  assert.ok(r.error, '应返回错误信息');
  assert.strictEqual(r.notice, undefined);
});

// ---------- removeById：正常 / 找不到 ----------
test('removeById 应删除并返回目标条目', () => {
  const list = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const removed = removeById(list, 'a');
  assert.strictEqual(removed.id, 'a');
  assert.deepStrictEqual(list, [{ id: 'b', text: 'B' }]);
});

test('removeById 找不到时应返回 null 且不修改列表', () => {
  const list = [{ id: 'a', text: 'A' }];
  const removed = removeById(list, 'zzz');
  assert.strictEqual(removed, null);
  assert.strictEqual(list.length, 1);
});
