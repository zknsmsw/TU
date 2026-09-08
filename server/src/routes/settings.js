// 站点设置接口：导航栏标题图（Logo）的上传 / 移除、页脚附加声明的增删
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware');
const { isRealImage } = require('../imageCheck');
const { validateText, createNotice, removeById } = require('../footerNotices');

const router = express.Router();

// 获取页脚声明列表存储（不存在则初始化为空数组）
function footerList() {
  const d = db.load();
  d.settings = d.settings || {};
  if (!Array.isArray(d.settings.footerNotices)) d.settings.footerNotices = [];
  return d.settings.footerNotices;
}

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function mimeToExt(mime) {
  const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
  return map[mime] || '.png';
}

// 读取页脚附加声明（公开，供全站页脚显示）
router.get('/footer', (req, res) => {
  const list = footerList();
  res.json({ code: 0, message: 'ok', data: list });
});

// 添加一条页脚附加声明（管理员）
router.post('/footer', requireAdmin, (req, res) => {
  const { text } = req.body || {};
  const created = createNotice(text);
  if (created.error) {
    return res.status(400).json({ code: 400, message: created.error });
  }
  footerList().push(created.notice);
  db.save();
  res.json({ code: 0, message: '声明已添加', data: created.notice });
});

// 删除一条页脚附加声明（管理员）
router.delete('/footer/:id', requireAdmin, (req, res) => {
  const removed = removeById(footerList(), req.params.id);
  if (!removed) {
    return res.status(404).json({ code: 404, message: '声明不存在' });
  }
  db.save();
  res.json({ code: 0, message: '声明已删除', data: { id: removed.id } });
});

function currentUrl() {
  const logo = (db.load().site && db.load().site.logo) || null;
  return logo ? `/uploads/${path.basename(logo)}` : null;
}

// 读取全部设置（公开）
router.get('/', (req, res) => {
  const settings = db.load().settings || {};
  res.json({ code: 0, message: 'ok', data: settings });
});

// 更新设置（管理员）：body 可含 { train: { defaultFare }, refund: { type, value } }
router.put('/', requireAdmin, (req, res) => {
  const body = req.body || {};
  const d = db.load();
  d.settings = d.settings || {};
  d.settings.train = d.settings.train || {};
  if (body.train && body.train.defaultFare !== undefined) {
    const v = Number(body.train.defaultFare);
    if (isNaN(v) || v < 0) {
      return res.status(400).json({ code: 400, message: '默认票价无效' });
    }
    d.settings.train.defaultFare = v;
  }
  if (body.refund) {
    const type = body.refund.type;
    if (!['none', 'fixed', 'percent'].includes(type)) {
      return res.status(400).json({ code: 400, message: '退票手续费类型无效' });
    }
    let value = 0;
    if (type !== 'none') {
      value = Number(body.refund.value);
      if (isNaN(value) || value < 0) {
        return res.status(400).json({ code: 400, message: '退票手续费数值无效' });
      }
    }
    d.settings.refund = { type, value };
  }
  db.save();
  res.json({ code: 0, message: '设置已保存', data: d.settings });
});

// 当前标题图地址（公开，供导航栏读取）
router.get('/logo', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { url: currentUrl() } });
});

// 上传 / 更新标题图（管理员）
router.post('/logo', requireAdmin, (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ code: 400, message: '缺少图片数据' });
  }
  const match = data.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ code: 400, message: '仅支持 png / jpeg / gif / webp 图片' });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    return res.status(400).json({ code: 400, message: '图片内容为空' });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ code: 400, message: '图片不能超过 5MB' });
  }
  // 校验真实文件内容（魔数），防止伪装成图片的 HTML/脚本
  if (!isRealImage(match[1], buffer)) {
    return res.status(400).json({ code: 400, message: '文件内容与图片格式不符，请重新上传' });
  }

  ensureDir();
  const filename = `logo${mimeToExt(match[1])}`;
  // 先删旧的，避免残留其它扩展名的旧文件
  const d = db.load();
  const old = (d.site && d.site.logo) || null;
  if (old && old !== filename) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(old))); } catch (e) { /* 忽略 */ }
  }
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  d.site = d.site || {};
  d.site.logo = filename;
  db.save();

  res.json({ code: 0, message: '标题图已更新', data: { url: `/uploads/${filename}` } });
});

// 移除标题图（管理员）
router.delete('/logo', requireAdmin, (req, res) => {
  const d = db.load();
  const old = (d.site && d.site.logo) || null;
  if (old) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(old))); } catch (e) { /* 忽略 */ }
  }
  d.site = d.site || {};
  d.site.logo = null;
  db.save();
  res.json({ code: 0, message: '已移除标题图', data: { url: null } });
});

module.exports = router;
