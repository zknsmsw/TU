// 站点接口：列表/新增/修改/删除
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();

function stationPublic(s) {
  return { id: s.id, name: s.name, city: s.city || '' };
}

// 站点列表（可按关键字搜索）
router.get('/', (req, res) => {
  const { keyword } = req.query;
  let stations = db.load().stations;
  if (keyword) {
    const kw = String(keyword).trim();
    stations = stations.filter((s) => s.name.includes(kw) || (s.city || '').includes(kw));
  }
  res.json({ code: 0, message: 'ok', data: stations.map(stationPublic) });
});

// 新增站点（管理员）
router.post('/', requireAdmin, (req, res) => {
  const { name, city } = req.body || {};
  const n = String(name || '').trim();
  if (!n) return res.status(400).json({ code: 400, message: '请填写站名' });
  const d = db.load();
  if (d.stations.some((s) => s.name === n)) {
    return res.status(409).json({ code: 409, message: '同名站点已存在（同名站会被视为换乘站）' });
  }
  const station = { id: db.nextId('stations'), name: n, city: String(city || '').trim() || null };
  d.stations.push(station);
  db.save();
  res.json({ code: 0, message: '站点已添加', data: stationPublic(station) });
});

// 修改站点（管理员）
router.put('/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const station = d.stations.find((s) => s.id === Number(req.params.id));
  if (!station) return res.status(404).json({ code: 404, message: '站点不存在' });
  const { name, city } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ code: 400, message: '站名不能为空' });
    if (n !== station.name && d.stations.some((s) => s.name === n)) {
      return res.status(409).json({ code: 409, message: '同名站点已存在' });
    }
    station.name = n;
  }
  if (city !== undefined) station.city = String(city).trim() || null;
  db.save();
  res.json({ code: 0, message: '站点已更新', data: stationPublic(station) });
});

// 删除站点（管理员）
router.delete('/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.stations.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '站点不存在' });
  if (d.trainLineStops.some((s) => s.stationId === id)) {
    return res.status(409).json({ code: 409, message: '该站已被线路使用，请先从线路中移除' });
  }
  d.stations.splice(idx, 1);
  db.save();
  res.json({ code: 0, message: '站点已删除', data: { id } });
});

module.exports = router;
