import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../store.js';
import StationSelect from '../components/StationSelect.jsx';

// 前台 · 订高铁票：按站点查车次，每站累计票价计费，下单
export default function Hs() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingTrain, setBookingTrain] = useState(null); // 正在购票的车次（对象）
  const [passengerName, setPassengerName] = useState('');
  const [bookMsg, setBookMsg] = useState(null);

  useEffect(() => {
    api
      .get('/hs/stations')
      .then((res) => setStations(res.data || []))
      .catch(() => {});
  }, []);

  const onSearch = async () => {
    setError('');
    setResults(null);
    setBookMsg(null);
    setBookingTrain(null);
    if (!fromId || !toId) {
      setError('请选择出发站和到达站');
      return;
    }
    if (fromId === toId) {
      setError('出发站和到达站不能相同');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/hs/search', { params: { from: fromId, to: toId } });
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

  const startBooking = (train) => {
    setBookMsg(null);
    if (!user) {
      navigate('/login');
      return;
    }
    setBookingTrain(train);
  };

  const submitBooking = async () => {
    setBookMsg(null);
    if (!passengerName.trim()) {
      setBookMsg({ type: 'error', text: '请填写乘车人姓名' });
      return;
    }
    try {
      const res = await api.post('/hs/book', {
        trainId: bookingTrain.trainId,
        fromId,
        toId,
        passengerName
      });
      setBookMsg({
        type: 'info',
        text: `购票成功，订单号 ${res.data.order.orderNo}，合计 ${res.data.total} 摩拉。`
      });
      setBookingTrain(null);
      setPassengerName('');
    } catch (e) {
      setBookMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="train-page">
      <h2>订高铁票</h2>
      <div className="train-form">
        <StationSelect stations={stations} value={fromId} onChange={setFromId} placeholder="选择出发站" />
        <button type="button" className="btn btn-swap" onClick={swap}>
          ⇄
        </button>
        <StationSelect stations={stations} value={toId} onChange={setToId} placeholder="选择到达站" />
        <button className="btn btn-primary" onClick={onSearch} disabled={loading}>
          {loading ? '查询中…' : '查询'}
        </button>
      </div>

      {stations.length === 0 && (
        <div className="form-info">暂未开通高铁线路，请先在后台「车次管理」添加车次。</div>
      )}

      {error && <div className="form-error">{error}</div>}

      {results && results.length === 0 && <div className="train-result">没有找到经过该区间的车次。</div>}

      {results && results.length > 0 && (
        <div className="train-result">
          <div className="train-summary">
            <strong>{results[0].from}</strong> → <strong>{results[0].to}</strong>
            <span className="train-fare">共 {results.length} 个车次</span>
          </div>

          {results.map((r) => (
            <div key={r.trainId} className="hs-row">
              <span className="hs-no">{r.trainNo}</span>
              {r.name && <span className="hs-name">{r.name}</span>}
              <span className="hs-operator">担当：{r.operator || '未设置'}</span>
              <span className="hs-time">
                {r.departTime} → {r.arriveTime}
              </span>
              <span className="hs-fare">{r.fare} 摩拉</span>
              <button className="btn btn-primary" onClick={() => startBooking(r)}>
                购票
              </button>
            </div>
          ))}

          {bookingTrain && (
            <div className="book-form">
              <span className="muted">
                车次 {bookingTrain.trainNo} · {bookingTrain.from} → {bookingTrain.to} ·{' '}
                {bookingTrain.fare} 摩拉
              </span>
              <input
                className="input"
                placeholder="乘车人姓名"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
              />
              <button className="btn btn-primary" onClick={submitBooking}>
                确认购票
              </button>
              <button className="btn" onClick={() => setBookingTrain(null)}>
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
