// 宣传图接口：列表（公开）/ 上传（管理员）/ 删除（管理员）
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware');
const { isRealImage } = require('../imageCheck');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function mimeToExt(mime) {
  const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
  return map[mime] || '.png';
}

// 宣传图列表（公开）
router.get('/', (req, res) => {
  const banners = db.load().banners.map((b) => ({ id: b.id, url: b.url, createdAt: b.createdAt }));
  res.json({ code: 0, message: 'ok', data: banners });
});

// 上传宣传图（管理员）
// 请求体：{ data: "data:image/png;base64,...." }
router.post('/', requireAdmin, (req, res) => {
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
  const d = db.load();
  const id = db.nextId('banners');
  const filename = `banner-${id}-${Date.now()}${mimeToExt(match[1])}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  const banner = { id, url: `/uploads/${filename}`, createdAt: new Date().toISOString() };
  d.banners.push(banner);
  db.save();

  res.json({ code: 0, message: '上传成功', data: banner });
});

// 删除宣传图（管理员）
router.delete('/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.banners.findIndex((b) => b.id === id);
  if (idx === -1) {
    return res.status(404).json({ code: 404, message: '图片不存在' });
  }
  const [banner] = d.banners.splice(idx, 1);
  const filename = path.basename(banner.url);
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, filename));
  } catch (e) {
    // 文件可能已被手动删除，忽略
  }
  db.save();
  res.json({ code: 0, message: '已删除', data: { id } });
});

module.exports = router;
