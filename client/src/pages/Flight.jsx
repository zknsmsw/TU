import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../store.js';
import AirportSelect from '../components/AirportSelect.jsx';

// 前台 · 订机票：按机场查询航班（支持机场名称/代码搜索），在线下单
export default function Flight() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [airports, setAirports] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingFlight, setBookingFlight] = useState(null); // 正在购票的航班（对象）
  const [passengerName, setPassengerName] = useState('');
  const [bookMsg, setBookMsg] = useState(null);

  useEffect(() => {
    api
      .get('/flight/airports')
      .then((res) => setAirports(res.data || []))
      .catch(() => {});
  }, []);

  const onSearch = async () => {
    setError('');
    setResults(null);
    setBookMsg(null);
    setBookingFlight(null);
    if (!fromId || !toId) {
      setError('请选择出发机场和到达机场');
      return;
    }
    if (fromId === toId) {
      setError('出发机场和到达机场不能相同');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/flight/search', { params: { from: fromId, to: toId } });
      setResults(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const startBooking = (flight) => {
    setBookMsg(null);
    if (!user) {
      navigate('/login');
      return;
    }
    setBookingFlight(flight);
  };

  const submitBooking = async () => {
    setBookMsg(null);
    if (!passengerName.trim()) {
      setBookMsg({ type: 'error', text: '请填写乘机人姓名' });
      return;
    }
    try {
      const res = await api.post('/flight/book', {
        flightId: bookingFlight.flightId,
        fromId,
        toId,
        passengerName
      });
      setBookMsg({
        type: 'info',
        text: `购票成功，订单号 ${res.data.order.orderNo}，合计 ${res.data.total} 摩拉。`
      });
      setBookingFlight(null);
      setPassengerName('');
    } catch (e) {
      setBookMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="train-page">
      <h2>订机票</h2>
      <div className="train-form">
        <AirportSelect airports={airports} value={fromId} onChange={setFromId} placeholder="输入机场名称或代码" />
        <button type="button" className="btn btn-swap" onClick={swap}>
          ⇄
        </button>
        <AirportSelect airports={airports} value={toId} onChange={setToId} placeholder="输入机场名称或代码" />
        <button className="btn btn-primary" onClick={onSearch} disabled={loading}>
          {loading ? '查询中…' : '查询'}
        </button>
      </div>

      {airports.length === 0 && (
        <div className="form-info">暂未开通航班，请先在后台「机场管理 / 航班管理」添加。</div>
      )}

      {error && <div className="form-error">{error}</div>}

      {results && results.length === 0 && <div className="train-result">没有找到该航线的航班。</div>}

      {results && results.length > 0 && (
        <div className="train-result">
          <div className="train-summary">
            <strong>{results[0].from}</strong> → <strong>{results[0].to}</strong>
            <span className="train-fare">共 {results.length} 个航班</span>
          </div>

          {results.map((r) => (
            <div key={r.flightId} className="hs-row">
              <span className="hs-no">{r.flightNo}</span>
              {r.operator && <span className="hs-operator">担当：{r.operator}</span>}
              <span className="hs-time">
                {r.departTime} → {r.arriveTime}
              </span>
              <span className="hs-fare">{r.price} 摩拉</span>
              <button className="btn btn-primary" onClick={() => startBooking(r)}>
                购票
              </button>
            </div>
          ))}

          {bookingFlight && (
            <div className="book-form">
              <span className="muted">
                航班 {bookingFlight.flightNo} · {bookingFlight.from} → {bookingFlight.to} ·{' '}
                {bookingFlight.departTime} 起飞 · {bookingFlight.price} 摩拉
              </span>
              <input
                className="input"
                placeholder="乘机人姓名"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
              />
              <button className="btn btn-primary" onClick={submitBooking}>
                确认购票
              </button>
              <button className="btn" onClick={() => setBookingFlight(null)}>
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {bookMsg && (
        <div className={bookMsg.type === 'error' ? 'form-error' : 'form-info'}>
          {bookMsg.text}
          {bookMsg.type === 'info' && (
            <>
              {' '}
              <Link to="/orders">查看我的订单</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
