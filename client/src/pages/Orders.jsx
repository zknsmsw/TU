import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../store.js';

const STATUS = { pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退票' };
const TYPE = { train: '火车票', hs: '高铁票', flight: '机票' };

// 我的订单：列表 + 模拟支付 / 取消
export default function Orders() {
  const user = useAuth((s) => s.user);
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = () => {
    api
      .get('/orders')
      .then((res) => setOrders(res.data || []))
      .catch((e) => setMsg(e.message));
  };
  useEffect(load, []);

  if (!user) {
    return (
      <div className="placeholder">
        <div className="placeholder-icon">🎫</div>
        <h2>我的订单</h2>
        <p>登录后即可查看和管理你的订单。</p>
        <Link className="btn btn-primary" to="/login">
          去登录
        </Link>
      </div>
    );
  }

  const pay = async (id) => {
    setMsg(null);
    try {
      await api.post(`/orders/${id}/pay`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm('确定取消该订单？')) return;
    setMsg(null);
    try {
      await api.post(`/orders/${id}/cancel`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const refund = async (id, fee, amount) => {
    if (!window.confirm(`确定退票？将扣除手续费 ${fee} 摩拉，实际退还 ${amount} 摩拉。`)) return;
    setMsg(null);
    try {
      await api.post(`/orders/${id}/refund`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="orders-page">
      <h2>我的订单</h2>
      {msg && <div className="form-error">{msg}</div>}
      {orders.length === 0 && <p>还没有订单，去订一张火车票吧。</p>}

      {orders.map((o) => (
        <div key={o.id} className="order-card">
          <div className="order-head">
            <span className="order-no">{o.orderNo}</span>
            <span className="order-type">{TYPE[o.type] || o.type}</span>
            <span className={`order-status s-${o.status}`}>{STATUS[o.status] || o.status}</span>
            <span className="order-total">{o.totalAmount} 摩拉</span>
          </div>

          <div className="order-items">
            {o.items.map((it) => (
              <div key={it.id} className="order-item">
                <span className="line-dot" style={{ background: it.lineColor || '#888' }} />
                <span className="order-item-line">{it.lineName}</span>
                <span className="order-item-route">
                  {it.origin} → {it.dest}
                </span>
                <span className="order-item-fare">{it.amount} 摩拉</span>
              </div>
            ))}
          </div>

          <div className="order-foot">
            <span className="muted">
              {new Date(o.createdAt).toLocaleString('zh-CN')} ·{' '}
              {o.type === 'flight' ? '乘机人' : '乘车人'}{' '}
              {o.items[0] ? o.items[0].passengerName : '-'}
            </span>
            {o.status === 'refunded' && o.refundAmount !== undefined && (
              <span className="muted">
                退票退还 {o.refundAmount} 摩拉（手续费 {o.refundFee} 摩拉）
              </span>
            )}
            {o.status === 'pending' && (
              <div className="order-actions">
                <button className="btn btn-primary" onClick={() => pay(o.id)}>
                  支付
                </button>
                <button className="btn" onClick={() => cancel(o.id)}>
                  取消
                </button>
              </div>
            )}
            {o.status === 'paid' && o.refundAmount !== undefined && (
              <div className="order-actions">
                <span className="muted">退票扣手续费 {o.refundFee} 摩拉，退还 {o.refundAmount} 摩拉</span>
                <button className="btn" onClick={() => refund(o.id, o.refundFee, o.refundAmount)}>
                  退票
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
