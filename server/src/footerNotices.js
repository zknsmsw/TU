// 页脚附加声明（footer notices）处理逻辑 —— 纯函数，便于单元测试。
// 管理员在后台添加的声明会被追加显示在网站页脚默认版权声明下方。
// 每个声明条目标记为 { id, text, createdAt }，存放于 db.settings.footerNotices。

const MAX_TEXT_LENGTH = 200; // 单条声明的最大字数（防止滥用 / 撑破页脚）

// 校验并规范化一条声明文本：
//  - 非字符串 → 报错
//  - 全空白 / 空 → 报错
//  - 超出长度上限 → 报错
//  - 合法 → 返回去除首尾空白后的文本
function validateText(text) {
  if (typeof text !== 'string') {
    return { ok: false, message: '声明内容必须是文本' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: '声明内容不能为空' };
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `单条声明不能超过 ${MAX_TEXT_LENGTH} 字` };
  }
  return { ok: true, value: trimmed };
}

// 生成一个不易冲突的声明条目 id
function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 创建一条声明条目（不写入存储，由调用方 push 到列表并保存）
function createNotice(text) {
  const r = validateText(text);
  if (!r.ok) return { error: r.message };
  return {
    notice: { id: makeId(), text: r.value, createdAt: new Date().toISOString() }
  };
}

// 按 id 从列表中删除一条声明；找到返回被删条目，未找到返回 null（不修改列表）
function removeById(list, id) {
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  return removed;
}

module.exports = { validateText, createNotice, removeById, MAX_TEXT_LENGTH };
