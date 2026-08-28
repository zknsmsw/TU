// 火车线路/经停站/站间票价接口 + 换乘查询
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware');
const { searchTrain, buildGraph } = require('../services/trainSearch');

const router = express.Router();

function genOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // 加密安全的随机数，避免订单号可预测/碰撞
  return `TY${ts}${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;
}

// ---------- 线路 ----------

// 线路列表（含站点数）
router.get('/lines', (req, res) => {
  const d = db.load();
  const lines = d.trainLines.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    description: l.description,
    operator: l.operator || '',
    isLoop: !!l.isLoop,
    stopCount: d.trainLineStops.filter((s) => s.lineId === l.id).length
  }));
  res.json({ code: 0, message: 'ok', data: lines });
});

// 线路详情（有序经停站 + 相邻站间的票价信息）
router.get('/lines/:id', (req, res) => {
  const d = db.load();
  const line = d.trainLines.find((l) => l.id === Number(req.params.id));
  if (!line) return res.status(404).json({ code: 404, message: '线路不存在' });
  const stops = d.trainLineStops
    .filter((s) => s.lineId === line.id)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => {
      const station = d.stations.find((st) => st.id === s.stationId);
      return {
        id: s.id,
        stationId: s.stationId,
        stationName: station ? station.name : '(已删除站点)',
        seq: s.seq,
        kmFromStart: s.kmFromStart
      };
    });
  const edges = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const fareRec = d.trainEdgeFares.find(
      (f) =>
        f.lineId === line.id &&
        ((f.stationAId === a.stationId && f.stationBId === b.stationId) ||
          (f.stationAId === b.stationId && f.stationBId === a.stationId))
    );
    edges.push({
      fromStopId: a.id,
      toStopId: b.id,
      fromStationId: a.stationId,
      toStationId: b.stationId,
      fromName: a.stationName,
      toName: b.stationName,
      fare: fareRec ? fareRec.fare : null
    });
  }
  // 环线：补上末站→首站的边，方便设置这一段的站间票价
  if (line.isLoop && stops.length >= 3) {
    const a = stops[stops.length - 1];
    const b = stops[0];
    const fareRec = d.trainEdgeFares.find(
      (f) =>
        f.lineId === line.id &&
        ((f.stationAId === a.stationId && f.stationBId === b.stationId) ||
          (f.stationAId === b.stationId && f.stationBId === a.stationId))
    );
    edges.push({
      fromStopId: a.id,
      toStopId: b.id,
      fromStationId: a.stationId,
      toStationId: b.stationId,
      fromName: a.stationName,
      toName: b.stationName,
      fare: fareRec ? fareRec.fare : null
    });
  }
  const defaultFare = Number(((d.settings || {}).train || {}).defaultFare) || 0;
  res.json({ code: 0, message: 'ok', data: { line, stops, edges, defaultFare } });
});

// 新增线路（管理员）
router.post('/lines', requireAdmin, (req, res) => {
  const { name, color, description, isLoop, operator } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ code: 400, message: '请填写线路名称' });
  }
  const d = db.load();
  const line = {
    id: db.nextId('trainLines'),
    name: String(name).trim(),
    color: color || '#888888',
    description: description || '',
    operator: operator ? String(operator).trim() : '',
    isLoop: !!isLoop
  };
  d.trainLines.push(line);
  db.save();
  res.json({ code: 0, message: '线路已创建', data: line });
});

// 修改线路信息（管理员）
router.put('/lines/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const line = d.trainLines.find((l) => l.id === Number(req.params.id));
  if (!line) return res.status(404).json({ code: 404, message: '线路不存在' });
  const { name, color, description, isLoop, operator } = req.body || {};
  if (name !== undefined && String(name).trim()) line.name = String(name).trim();
  if (color !== undefined) line.color = color;
  if (description !== undefined) line.description = description;
  if (operator !== undefined) line.operator = String(operator).trim();
  if (isLoop !== undefined) line.isLoop = !!isLoop;
  db.save();
  res.json({ code: 0, message: '线路已更新', data: line });
});

// 删除线路（连带删除经停站和该线路的站间票价）（管理员）
router.delete('/lines/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.trainLines.findIndex((l) => l.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '线路不存在' });
  d.trainLines.splice(idx, 1);
  d.trainLineStops = d.trainLineStops.filter((s) => s.lineId !== id);
  d.trainEdgeFares = d.trainEdgeFares.filter((f) => f.lineId !== id);
  db.save();
  res.json({ code: 0, message: '线路已删除', data: { id } });
});

// 添加经停站（可指定 seq 插入，默认追加末尾）（管理员）
router.post('/lines/:id/stops', requireAdmin, (req, res) => {
  const d = db.load();
  const lineId = Number(req.params.id);
  const line = d.trainLines.find((l) => l.id === lineId);
  if (!line) return res.status(404).json({ code: 404, message: '线路不存在' });
  const { stationId, kmFromStart, seq } = req.body || {};
  const sid = Number(stationId);
  if (!sid || !d.stations.some((s) => s.id === sid)) {
    return res.status(400).json({ code: 400, message: '请选择有效的站点' });
  }
  const stops = d.trainLineStops.filter((s) => s.lineId === lineId);
  if (stops.some((s) => s.stationId === sid)) {
    return res.status(400).json({ code: 400, message: '该站已在此线路上' });
  }
  let insertSeq;
  if (seq !== undefined && Number(seq) >= 1 && Number(seq) <= stops.length + 1) {
    insertSeq = Number(seq);
    d.trainLineStops.forEach((s) => {
      if (s.lineId === lineId && s.seq >= insertSeq) s.seq += 1;
    });
  } else {
    insertSeq = stops.length + 1;
  }
  const stop = {
    id: db.nextId('trainLineStops'),
    lineId,
    stationId: sid,
    seq: insertSeq,
    kmFromStart: kmFromStart !== undefined && kmFromStart !== '' ? Number(kmFromStart) : null
  };
  d.trainLineStops.push(stop);
  db.save();
  res.json({ code: 0, message: '站点已添加', data: stop });
});

// 更新经停站（里程等，可选）（管理员）
router.put('/stops/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const stop = d.trainLineStops.find((s) => s.id === Number(req.params.id));
  if (!stop) return res.status(404).json({ code: 404, message: '经停记录不存在' });
  const { kmFromStart } = req.body || {};
  if (kmFromStart !== undefined) {
    stop.kmFromStart = kmFromStart === '' ? null : Number(kmFromStart);
  }
  db.save();
  res.json({ code: 0, message: '已更新', data: stop });
});

// 删除经停站（重新排序，并清理涉及该站的站间票价）（管理员）
router.delete('/stops/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const stop = d.trainLineStops.find((s) => s.id === id);
  if (!stop) return res.status(404).json({ code: 404, message: '经停记录不存在' });
  d.trainLineStops = d.trainLineStops.filter((s) => s.id !== id);
  const stops = d.trainLineStops.filter((s) => s.lineId === stop.lineId).sort((a, b) => a.seq - b.seq);
  stops.forEach((s, i) => {
    s.seq = i + 1;
  });
  d.trainEdgeFares = d.trainEdgeFares.filter(
    (f) => !(f.lineId === stop.lineId && (f.stationAId === stop.stationId || f.stationBId === stop.stationId))
  );
  db.save();
  res.json({ code: 0, message: '站点已移除', data: { id } });
});

// 重排线路站点顺序（管理员）
router.put('/lines/:id/reorder', requireAdmin, (req, res) => {
  const d = db.load();
  const lineId = Number(req.params.id);
  const { stopIds } = req.body || {};
  if (!Array.isArray(stopIds)) return res.status(400).json({ code: 400, message: '参数错误' });
  const map = new Map(d.trainLineStops.filter((s) => s.lineId === lineId).map((s) => [s.id, s]));
  stopIds.forEach((id, i) => {
    const s = map.get(Number(id));
    if (s) s.seq = i + 1;
  });
  db.save();
  res.json({ code: 0, message: '顺序已更新', data: { stopIds } });
});

// ---------- 站间票价 ----------

// 设置某条线路上两个站点之间的票价；fare 为空表示恢复默认
router.put('/lines/:id/edge-fares', requireAdmin, (req, res) => {
  const d = db.load();
  const lineId = Number(req.params.id);
  const line = d.trainLines.find((l) => l.id === lineId);
  if (!line) return res.status(404).json({ code: 404, message: '线路不存在' });
  const { stationAId, stationBId, fare } = req.body || {};
  const a = Number(stationAId);
  const b = Number(stationBId);
  const stopStationIds = d.trainLineStops.filter((s) => s.lineId === lineId).map((s) => s.stationId);
  if (!stopStationIds.includes(a) || !stopStationIds.includes(b) || a === b) {
    return res.status(400).json({ code: 400, message: '无效的站点组合' });
  }
  const keyA = a < b ? a : b;
  const keyB = a < b ? b : a;
  d.trainEdgeFares = d.trainEdgeFares || [];
  const idx = d.trainEdgeFares.findIndex(
    (f) => f.lineId === lineId && f.stationAId === keyA && f.stationBId === keyB
  );

  if (fare === null || fare === '' || fare === undefined) {
    if (idx >= 0) d.trainEdgeFares.splice(idx, 1);
    db.save();
    return res.json({ code: 0, message: '已恢复为默认票价', data: { fare: null } });
  }
  const fareNum = Number(fare);
  if (isNaN(fareNum) || fareNum < 0) {
    return res.status(400).json({ code: 400, message: '票价无效' });
  }
  if (idx >= 0) {
    d.trainEdgeFares[idx].fare = fareNum;
  } else {
    d.trainEdgeFares.push({
      id: db.nextId('trainEdgeFares'),
      lineId,
      stationAId: keyA,
      stationBId: keyB,
      fare: fareNum
    });
  }
  db.save();
  res.json({ code: 0, message: '站间票价已设置', data: { fare: fareNum } });
});

// ---------- 换乘查询 ----------

// 调试接口：列出所有线路的环线标记、图中全部相邻站对、以及一次查询的结果（用于排查）
// 仅管理员可见，防止泄露内部图结构
router.get('/debug', requireAdmin, (req, res) => {
  const d = db.load();
  const { from, to } = req.query;
  const stationName = (id) => {
    const s = d.stations.find((st) => st.id === Number(id));
    return s ? s.name : String(id);
  };
  const lineName = (id) => {
    const l = d.trainLines.find((x) => x.id === id);
    return l ? l.name : String(id);
  };
  const { edgeMap } = buildGraph();
  const lines = d.trainLines.map((l) => ({ id: l.id, name: l.name, isLoop: !!l.isLoop }));
  const edges = Object.entries(edgeMap).map(([key, v]) => {
    const [a, b] = key.split('-');
    return {
      pair: `${stationName(a)} ↔ ${stationName(b)}`,
      weight: v.weight,
      lines: v.lines.map(lineName)
    };
  });
  const result = from && to ? searchTrain(Number(from), Number(to)) : null;
  res.json({ code: 0, message: 'ok', data: { lines, edges, result } });
});

// 查询：/api/train/search?from=<站点id>&to=<站点id>
router.get('/search', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ code: 400, message: '请指定出发站和到达站' });
  const result = searchTrain(Number(from), Number(to));
  if (result.error) return res.status(400).json({ code: 400, message: result.error });
  res.json({ code: 0, message: 'ok', data: result });
});

// ---------- 购票（下单） ----------

// 火车购票：按当前线路/票价重新计算行程，生成订单（需登录）
router.post('/book', requireAuth, (req, res) => {
  const { fromId, toId, passengerName } = req.body || {};
  const from = Number(fromId);
  const to = Number(toId);
  const name = String(passengerName || '').trim();
  if (!from || !to) return res.status(400).json({ code: 400, message: '请选择出发站和到达站' });
  if (!name) return res.status(400).json({ code: 400, message: '请填写乘车人姓名' });

  const result = searchTrain(from, to);
  if (result.error) return res.status(400).json({ code: 400, message: result.error });
  if (!result.reachable) return res.status(400).json({ code: 400, message: '该区间无法到达' });

  const d = db.load();
  const order = {
    id: db.nextId('orders'),
    orderNo: genOrderNo(),
    userId: req.user.id,
    type: 'train',
    status: 'pending',
    totalAmount: result.fare,
    createdAt: new Date().toISOString()
  };
  d.orders.push(order);

  result.segments.forEach((sg, i) => {
    d.orderItems.push({
      id: db.nextId('orderItems'),
      orderId: order.id,
      itemType: 'train',
      lineId: sg.line.id,
      lineName: sg.line.name,
      lineColor: sg.line.color || '#888',
      segmentSeq: i,
      origin: sg.from,
      dest: sg.to,
      departTime: null,
      amount: sg.fare,
      passengerName: name
    });
  });
  db.save();

  res.json({ code: 0, message: '下单成功', data: { order, total: result.fare, segments: result.segments } });
});

module.exports = router;
