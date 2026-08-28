// 机票接口：机场管理 / 航班管理（管理员）+ 查询 + 购票
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

// 起落时间格式：HH:mm（允许 0~23 时，跨天到达场景由数据本身表达）
function validTime(s) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s));
}

function airportName(d, id) {
  const a = (d.airports || []).find((x) => x.id === Number(id));
  return a ? a.name : '(已删除机场)';
}

// ---------- 机场 ----------

// 机场列表（公开）：可按名称 / 代码 / 城市关键字搜索
router.get('/airports', (req, res) => {
  const { keyword } = req.query;
  let airports = db.load().airports || [];
  if (keyword) {
    const kw = String(keyword).trim().toLowerCase();
    airports = airports.filter(
      (a) =>
        a.name.toLowerCase().includes(kw) ||
        (a.code || '').toLowerCase().includes(kw) ||
        (a.city || '').toLowerCase().includes(kw)
    );
  }
  res.json({ code: 0, message: 'ok', data: airports });
});

// 新增机场（管理员）：名称 + 机场代码 + 城市
router.post('/airports', requireAdmin, (req, res) => {
  const { name, code, city } = req.body || {};
  const n = String(name || '').trim();
  const c = String(code || '').trim().toUpperCase();
  if (!n) {
    return res.status(400).json({ code: 400, message: '请填写机场名称' });
  }
  if (!/^[A-Z]{2,4}$/.test(c)) {
    return res.status(400).json({ code: 400, message: '机场代码需为 2~4 位字母（如 PVG）' });
  }
  const d = db.load();
  if (d.airports.some((a) => a.code === c)) {
    return res.status(409).json({ code: 409, message: '该机场代码已存在' });
  }
  if (d.airports.some((a) => a.name === n)) {
    return res.status(409).json({ code: 409, message: '同名机场已存在' });
  }
  const airport = {
    id: db.nextId('airports'),
    name: n,
    code: c,
    city: String(city || '').trim() || null,
    createdAt: new Date().toISOString()
  };
  d.airports.push(airport);
  db.save();
  res.json({ code: 0, message: '机场已添加', data: airport });
});

// 修改机场（管理员）
router.put('/airports/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const airport = d.airports.find((a) => a.id === Number(req.params.id));
  if (!airport) return res.status(404).json({ code: 404, message: '机场不存在' });
  const { name, code, city } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ code: 400, message: '机场名称不能为空' });
    if (n !== airport.name && d.airports.some((a) => a.name === n)) {
      return res.status(409).json({ code: 409, message: '同名机场已存在' });
    }
    airport.name = n;
  }
  if (code !== undefined) {
    const c = String(code).trim().toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(c)) {
      return res.status(400).json({ code: 400, message: '机场代码需为 2~4 位字母（如 PVG）' });
    }
    if (c !== airport.code && d.airports.some((a) => a.code === c)) {
      return res.status(409).json({ code: 409, message: '该机场代码已存在' });
    }
    airport.code = c;
  }
  if (city !== undefined) airport.city = String(city).trim() || null;
  db.save();
  res.json({ code: 0, message: '机场已更新', data: airport });
});

// 删除机场（管理员）：被航班使用中的机场不可删除
router.delete('/airports/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.airports.findIndex((a) => a.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '机场不存在' });
  if ((d.flights || []).some((f) => f.fromAirportId === id || f.toAirportId === id)) {
    return res.status(409).json({ code: 409, message: '该机场已被航班使用，请先删除相关航班' });
  }
  d.airports.splice(idx, 1);
  db.save();
  res.json({ code: 0, message: '机场已删除', data: { id } });
});

// ---------- 航班 ----------

// 航班列表（公开）：附带起降机场名称/代码
router.get('/flights', (req, res) => {
  const d = db.load();
  const codeOf = (id) => {
    const a = (d.airports || []).find((x) => x.id === Number(id));
    return a ? a.code : '';
  };
  const flights = (d.flights || []).map((f) => ({
    ...f,
    fromName: airportName(d, f.fromAirportId),
    toName: airportName(d, f.toAirportId),
    fromCode: codeOf(f.fromAirportId),
    toCode: codeOf(f.toAirportId)
  }));
  res.json({ code: 0, message: 'ok', data: flights });
});

// 校验航班字段（新增/修改共用）
function validateFlight(body, d, selfId) {
  const { flightNo, fromAirportId, toAirportId, departTime, arriveTime, price, operator } = body || {};
  const no = String(flightNo || '').trim();
  if (!no) return { error: '请填写航班号' };
  if (no.length > 10) return { error: '航班号过长' };
  const from = Number(fromAirportId);
  const to = Number(toAirportId);
  if (!from || !to) return { error: '请选择起飞机场和到达机场' };
  if (from === to) return { error: '起飞机场与到达机场不能相同' };
  if (!(d.airports || []).some((a) => a.id === from)) return { error: '起飞机场不存在' };
  if (!(d.airports || []).some((a) => a.id === to)) return { error: '到达机场不存在' };
  if (!validTime(departTime)) return { error: '起飞时间格式应为 HH:mm' };
  if (!validTime(arriveTime)) return { error: '降落时间格式应为 HH:mm' };
  const p = Number(price);
  if (isNaN(p) || p < 0) return { error: '票价无效' };
  if (
    (d.flights || []).some(
      (f) => f.flightNo === no && f.id !== selfId
    )
  ) {
    return { error: '该航班号已存在' };
  }
  return {
    value: {
      flightNo: no,
      fromAirportId: from,
      toAirportId: to,
      departTime: String(departTime).trim(),
      arriveTime: String(arriveTime).trim(),
      price: p,
      operator: operator ? String(operator).trim() : ''
    }
  };
}

// 新增航班（管理员）：班次（航班号）+ 起降机场 + 起落时间 + 票价
router.post('/flights', requireAdmin, (req, res) => {
  const d = db.load();
  const r = validateFlight(req.body, d);
  if (r.error) return res.status(400).json({ code: 400, message: r.error });
  const flight = {
    id: db.nextId('flights'),
    ...r.value,
    createdAt: new Date().toISOString()
  };
  d.flights.push(flight);
  db.save();
  res.json({ code: 0, message: '航班已添加', data: flight });
});

// 修改航班（管理员）
router.put('/flights/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const flight = d.flights.find((f) => f.id === Number(req.params.id));
  if (!flight) return res.status(404).json({ code: 404, message: '航班不存在' });
  const merged = { ...flight, ...req.body };
  const r = validateFlight(merged, d, flight.id);
  if (r.error) return res.status(400).json({ code: 400, message: r.error });
  Object.assign(flight, r.value);
  db.save();
  res.json({ code: 0, message: '航班已更新', data: flight });
});

// 删除航班（管理员）
router.delete('/flights/:id', requireAdmin, (req, res) => {
  const d = db.load();
  const id = Number(req.params.id);
  const idx = d.flights.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '航班不存在' });
  d.flights.splice(idx, 1);
  db.save();
  res.json({ code: 0, message: '航班已删除', data: { id } });
});

// ---------- 查询 / 购票 ----------

function searchFlights(from, to) {
  const d = db.load();
  if (from === to) return [];
  return (d.flights || [])
    .filter((f) => f.fromAirportId === from && f.toAirportId === to)
    .map((f) => ({
      flightId: f.id,
      flightNo: f.flightNo,
      operator: f.operator || '',
      from: airportName(d, f.fromAirportId),
      to: airportName(d, f.toAirportId),
      departTime: f.departTime,
      arriveTime: f.arriveTime,
      price: f.price
    }))
    .sort((a, b) => String(a.departTime).localeCompare(String(b.departTime)));
}

// 查询：/api/flight/search?from=<机场id>&to=<机场id>
router.get('/search', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ code: 400, message: '请指定出发机场和到达机场' });
  const results = searchFlights(Number(from), Number(to));
  res.json({ code: 0, message: 'ok', data: results });
});

// 机票购票（需登录）：按航班 + 区间重新计算票价并下单
router.post('/book', requireAuth, (req, res) => {
  const { flightId, fromId, toId, passengerName } = req.body || {};
  const fid = Number(flightId);
  const from = Number(fromId);
  const to = Number(toId);
  const name = String(passengerName || '').trim();
  if (!fid || !from || !to) return res.status(400).json({ code: 400, message: '参数不完整' });
  if (!name) return res.status(400).json({ code: 400, message: '请填写乘机人姓名' });

  const d = db.load();
  const flight = d.flights.find((f) => f.id === fid);
  if (!flight) return res.status(404).json({ code: 404, message: '航班不存在' });
  // 方向必须与航班一致，防止篡改区间
  if (flight.fromAirportId !== from || flight.toAirportId !== to) {
    return res.status(400).json({ code: 400, message: '航班与所选区间不匹配' });
  }

  const order = {
    id: db.nextId('orders'),
    orderNo: genOrderNo(),
    userId: req.user.id,
    type: 'flight',
    status: 'pending',
    totalAmount: flight.price,
    createdAt: new Date().toISOString()
  };
  d.orders.push(order);
  d.orderItems.push({
    id: db.nextId('orderItems'),
    orderId: order.id,
    itemType: 'flight',
    flightId: flight.id,
    lineName: flight.flightNo,
    lineColor: '#3a7bd5',
    segmentSeq: 0,
    origin: airportName(d, flight.fromAirportId),
    dest: airportName(d, flight.toAirportId),
    departTime: flight.departTime || '',
    amount: flight.price,
    passengerName: name
  });
  db.save();

  res.json({ code: 0, message: '下单成功', data: { order, total: flight.price } });
});

module.exports = router;
