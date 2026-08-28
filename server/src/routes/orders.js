// 订单接口：我的订单 / 详情 / 模拟支付 / 取消
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();

function orderWithItems(order) {
  const items = db.load().orderItems.filter((i) => i.orderId === order.id);
  const out = { ...order, items };
  // 已支付订单：提前按当前退票规则算出扣多少手续费、退多少（供前端展示）
  if (order.status === 'paid') {
    const fee = calcRefundFee(order.totalAmount);
    out.refundFee = fee;
    out.refundAmount = order.totalAmount - fee;
  }
  return out;
}

// 计算退票手续费：未设置/不收=0；定额=固定金额；百分比=总额*比例（封顶为订单总额）
function calcRefundFee(total) {
  const d = db.load();
  const r = (d.settings || {}).refund;
  if (!r || r.type === 'none') return 0;
  const value = Number(r.value) || 0;
  if (r.type === 'fixed') return Math.min(total, value);
  if (r.type === 'percent') return Math.min(total, Math.round((total * value) / 100));
  return 0;
}

// 我的订单列表
router.get('/', requireAuth, (req, res) => {
  const orders = db
    .load()
    .orders.filter((o) => o.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(orderWithItems);
  res.json({ code: 0, message: 'ok', data: orders });
});

// 订单详情
router.get('/:id', requireAuth, (req, res) => {
  const order = db.load().orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '无权查看该订单' });
  }
  res.json({ code: 0, message: 'ok', data: orderWithItems(order) });
});

// 模拟支付（待支付 -> 已支付）
router.post('/:id/pay', requireAuth, (req, res) => {
  const order = db.load().orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ code: 403, message: '无权操作' });
  if (order.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '只有待支付订单可以支付' });
  }
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  db.save();
  res.json({ code: 0, message: '支付成功', data: orderWithItems(order) });
});

// 取消订单（仅待支付）
router.post('/:id/cancel', requireAuth, (req, res) => {
  const order = db.load().orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ code: 403, message: '无权操作' });
  if (order.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '只有待支付订单可以取消' });
  }
  order.status = 'cancelled';
  db.save();
  res.json({ code: 0, message: '订单已取消', data: orderWithItems(order) });
});

// 退票（仅已支付）
router.post('/:id/refund', requireAuth, (req, res) => {
  const order = db.load().orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ code: 403, message: '无权操作' });
  if (order.status !== 'paid') {
    return res.status(400).json({ code: 400, message: '只有已支付订单可以退票' });
  }
  const fee = calcRefundFee(order.totalAmount);
  const refundAmount = order.totalAmount - fee;
  order.status = 'refunded';
  order.refundFee = fee;
  order.refundAmount = refundAmount;
  order.refundedAt = new Date().toISOString();
  db.save();
  res.json({ code: 0, message: '退票成功', data: orderWithItems(order) });
});

module.exports = router;
