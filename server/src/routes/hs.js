// 高铁车次/经停站接口 + 查询 + 购票
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware');

const router = express.Router();

function genOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // 加密安全的随机数，避免订单号可预测/碰撞
  return `TY${ts}${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;
}

function stationNameOf(d, id) {
  const s = d.stations.find((st) => st.id === Number(id));
  return s ? s.name : String(id);
}

// ---------- 车次 ----------

// 车次列表（含站点数）
router.get('/trains', (req, res) => {
  const d = db.load();
  const trains = d.hsTrains.map((t) => ({
    id: t.id,
    trainNo: t.trainNo,
    name: t.name || '',
    operator: t.operator || '',
    stopCount: d.hsStops.filter((s) => s.trainId === t.id).length
  }));
  res.json({ code: 0, message: 'ok', data: trains });
});

// 车次详情（有序经停站）
router.get('/trains/:id', (req, res) => {
  const d = db.load();
  const train = d.hsTrains.find((t) => t.id === Number(req.params.id));
  if (!train) return res.status(404).json({ code: 404, message: '车次不存在' });
  const stops = d.hsStops
    .filter((s) => s.trainId === train.id)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => {
      const station = d.stations.find((st) => st.id === s.stationId);
      return {
        id: s.id,
        stationId: s.stationId,
        stationName: station ? station.name : '(已删除站点)',
        seq: s.seq,
        arriveTime: s.arriveTime || '',
        departTime: s.departTime || '',
        priceFromOrigin: s.priceFromOrigin
      };
    });
  res.json({ code: 0, message: 'ok', data: { train, stops } });
});

// 新增车次（管理员）
router.post('/trains', requireAdmin, (req, res) => {
  const { trainNo, name, operator } = req.body || {};
  const no = String(trainNo || '').trim();
  if (!no) return res.status(400).json({ code: 400, message: '请填写车次号' });
  const d = db.load();
  if (d.hsTrains.some((t) => t.trainNo === no)) {
    return res.status(409).json({ code: 409, message: '该车次号已存在' });
  }
  const train = {
    id: db.nextId('hsTrains'),
    trainNo: no,
    name: String(name || '').trim() || '',
    operator: String(operator || '').trim() || '',
    createdAt: new Date().toISOString()
  };
  d.hsTrains.push(train);
  db.save();
  res.json({ code: 0, message: '车次已创建', data: train });
});

// 修改车次（管理员）
router.put('/trains/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const train = d.hsTrains.find((t) => t.id === Number(req.params.id));
  if (!train) return res.status(404).json({ code: 404, message: '车次不存在' });
  const { trainNo, name, operator } = req.body || {};
  if (trainNo !== undefined && String(trainNo).trim()) train.trainNo = String(trainNo).trim();
  if (name !== undefined) train.name = String(name).trim();
  if (operator !== undefined) train.operator = String(operator).trim();
  db.save();
  res.json({ code: 0, message: '车次已更新', data: train });
});

// 删除车次（连带删除经停站）（管理员）
router.delete('/trains/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.hsTrains.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '车次不存在' });
  d.hsTrains.splice(idx, 1);
  d.hsStops = d.hsStops.filter((s) => s.trainId !== id);
  db.save();
  res.json({ code: 0, message: '车次已删除', data: { id } });
});

// ---------- 经停站 ----------

// 添加经停站（可指定 seq 插入，默认末尾）（管理员）
router.post('/trains/:id/stops', requireAdmin, (req, res) => {
  const d = db.load();
  const trainId = Number(req.params.id);
  const train = d.hsTrains.find((t) => t.id === trainId);
  if (!train) return res.status(404).json({ code: 404, message: '车次不存在' });
  const { stationId, arriveTime, departTime, priceFromOrigin, seq } = req.body || {};
  const sid = Number(stationId);
  if (!sid || !d.stations.some((s) => s.id === sid)) {
    return res.status(400).json({ code: 400, message: '请选择有效的站点' });
  }
  // 累计票价必须为非负数，防止产生负数票价
  if (priceFromOrigin !== undefined && priceFromOrigin !== '') {
    const p = Number(priceFromOrigin);
    if (isNaN(p) || p < 0) {
      return res.status(400).json({ code: 400, message: '累计票价无效' });
    }
  }
  const stops = d.hsStops.filter((s) => s.trainId === trainId);
  if (stops.some((s) => s.stationId === sid)) {
    return res.status(400).json({ code: 400, message: '该站已在此车次上' });
  }
  let insertSeq;
  if (seq !== undefined && Number(seq) >= 1 && Number(seq) <= stops.length + 1) {
    insertSeq = Number(seq);
    d.hsStops.forEach((s) => {
      if (s.trainId === trainId && s.seq >= insertSeq) s.seq += 1;
    });
  } else {
    insertSeq = stops.length + 1;
  }
  const stop = {
    id: db.nextId('hsStops'),
    trainId,
    stationId: sid,
    seq: insertSeq,
    arriveTime: String(arriveTime || '').trim(),
    departTime: String(departTime || '').trim(),
    priceFromOrigin: priceFromOrigin !== undefined && priceFromOrigin !== '' ? Number(priceFromOrigin) : 0
  };
  d.hsStops.push(stop);
  db.save();
  res.json({ code: 0, message: '站点已添加', data: stop });
});

// 更新经停站（时间/累计票价）（管理员）
router.put('/stops/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const stop = d.hsStops.find((s) => s.id === Number(req.params.id));
  if (!stop) return res.status(404).json({ code: 404, message: '经停记录不存在' });
  const { arriveTime, departTime, priceFromOrigin } = req.body || {};
  if (arriveTime !== undefined) stop.arriveTime = String(arriveTime).trim();
  if (departTime !== undefined) stop.departTime = String(departTime).trim();
  if (priceFromOrigin !== undefined) {
    if (priceFromOrigin !== '' && (isNaN(Number(priceFromOrigin)) || Number(priceFromOrigin) < 0)) {
      return res.status(400).json({ code: 400, message: '累计票价无效' });
    }
    stop.priceFromOrigin = priceFromOrigin === '' ? 0 : Number(priceFromOrigin);
  }
  db.save();
  res.json({ code: 0, message: '已更新', data: stop });
});

// 删除经停站（重新排序）（管理员）
router.delete('/stops/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const stop = d.hsStops.find((s) => s.id === id);
  if (!stop) return res.status(404).json({ code: 404, message: '经停记录不存在' });
  d.hsStops = d.hsStops.filter((s) => s.id !== id);
  const stops = d.hsStops.filter((s) => s.trainId === stop.trainId).sort((a, b) => a.seq - b.seq);
  stops.forEach((s, i) => {
    s.seq = i + 1;
  });
  db.save();
  res.json({ code: 0, message: '站点已移除', data: { id } });
});

// 重排经停站顺序（管理员）
router.put('/trains/:id/reorder', requireAdmin, (req, res) => {
  const d = db.load();
  const trainId = Number(req.params.id);
  const { stopIds } = req.body || {};
  if (!Array.isArray(stopIds)) return res.status(400).json({ code: 400, message: '参数错误' });
  const map = new Map(d.hsStops.filter((s) => s.trainId === trainId).map((s) => [s.id, s]));
  stopIds.forEach((id, i) => {
    const s = map.get(Number(id));
    if (s) s.seq = i + 1;
  });
  db.save();
  res.json({ code: 0, message: '顺序已更新', data: { stopIds } });
});

// 已开通高铁线路的站点列表（供前台订高铁票选择）
router.get('/stations', (req, res) => {
  const d = db.load();
  const served = new Set((d.hsStops || []).map((s) => s.stationId));
  const stations = (d.stations || [])
    .filter((s) => served.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, city: s.city || '' }));
  res.json({ code: 0, message: 'ok', data: stations });
});

// ---------- 查询 / 购票 ----------

// 查询：/api/hs/search?from=<站点id>&to=<站点id>
router.get('/search', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ code: 400, message: '请指定出发站和到达站' });
  const results = searchHs(Number(from), Number(to));
  if (results.error) return res.status(400).json({ code: 400, message: results.error });
  res.json({ code: 0, message: 'ok', data: results });
});

// 高铁购票（需登录）：按车次+区间重新计算票价并下单
router.post('/book', requireAuth, (req, res) => {
  const { trainId, fromId, toId, passengerName } = req.body || {};
  const tid = Number(trainId);
  const from = Number(fromId);
  const to = Number(toId);
  const name = String(passengerName || '').trim();
  if (!tid || !from || !to) return res.status(400).json({ code: 400, message: '参数不完整' });
  if (!name) return res.status(400).json({ code: 400, message: '请填写乘车人姓名' });

  const d = db.load();
  const train = d.hsTrains.find((t) => t.id === tid);
  if (!train) return res.status(404).json({ code: 404, message: '车次不存在' });
  const stops = d.hsStops.filter((s) => s.trainId === tid).sort((a, b) => a.seq - b.seq);
  const fromIdx = stops.findIndex((s) => s.stationId === from);
  const toIdx = stops.findIndex((s) => s.stationId === to);
  if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
    return res.status(400).json({ code: 400, message: '该车次不经过所选区间' });
  }
  // 票价 = 到站累计价 − 出发站累计价；取非负值防止数据异常产生负数票价
  const fare = Math.max(
    0,
    (Number(stops[toIdx].priceFromOrigin) || 0) - (Number(stops[fromIdx].priceFromOrigin) || 0)
  );

  const order = {
    id: db.nextId('orders'),
    orderNo: genOrderNo(),
    userId: req.user.id,
    type: 'hs',
    status: 'pending',
    totalAmount: fare,
    createdAt: new Date().toISOString()
  };
  d.orders.push(order);
  d.orderItems.push({
    id: db.nextId('orderItems'),
    orderId: order.id,
    itemType: 'hs',
    trainId: tid,
    lineName: train.trainNo,
    lineColor: '#005c8b',
    segmentSeq: 0,
    origin: stationNameOf(d, from),
    dest: stationNameOf(d, to),
    departTime: stops[fromIdx].departTime || '',
    amount: fare,
    passengerName: name
  });
  db.save();

  res.json({ code: 0, message: '下单成功', data: { order, total: fare } });
});

function searchHs(from, to) {
  const d = db.load();
  if (from === to) return { error: '出发站与到达站相同' };
  const results = [];
  for (const train of d.hsTrains || []) {
    const stops = d.hsStops.filter((s) => s.trainId === train.id).sort((a, b) => a.seq - b.seq);
    const fromIdx = stops.findIndex((s) => s.stationId === from);
    const toIdx = stops.findIndex((s) => s.stationId === to);
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;
    // 票价取非负，防止数据异常产生负数票价
    const fare = Math.max(
      0,
      (Number(stops[toIdx].priceFromOrigin) || 0) - (Number(stops[fromIdx].priceFromOrigin) || 0)
    );
    results.push({
      trainId: train.id,
      trainNo: train.trainNo,
      name: train.name || '',
      operator: train.operator || '',
      from: stationNameOf(d, from),
      to: stationNameOf(d, to),
      departTime: stops[fromIdx].departTime || '',
      arriveTime: stops[toIdx].arriveTime || '',
      fare
    });
  }
  results.sort((a, b) => String(a.departTime).localeCompare(String(b.departTime)));
  return results;
}

module.exports = router;
