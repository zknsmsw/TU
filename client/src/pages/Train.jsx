import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../store.js';
import StationSelect from '../components/StationSelect.jsx';

// 前台 · 订火车票：按站点查询，自动换乘 + 站间票价计费 + 下单
export default function Train() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [bookMsg, setBookMsg] = useState(null);

  useEffect(() => {
    api
      .get('/stations')
      .then((res) => setStations(res.data || []))
      .catch(() => {});
  }, []);

  const onSearch = async () => {
    setError('');
    setResult(null);
    setBookMsg(null);
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
      const res = await api.get('/train/search', { params: { from: fromId, to: toId } });
      setResult(res.data);
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

  const startBooking = () => {
    setBookMsg(null);
    if (!user) {
      navigate('/login');
      return;
    }
    setBooking(true);
  };

  const submitBooking = async () => {
    setBookMsg(null);
    if (!passengerName.trim()) {
      setBookMsg({ type: 'error', text: '请填写乘车人姓名' });
      return;
    }
    try {
      const res = await api.post('/train/book', { fromId, toId, passengerName });
      setBookMsg({
        type: 'info',
        text: `购票成功，订单号 ${res.data.order.orderNo}，合计 ${res.data.total} 摩拉。`
      });
      setBooking(false);
      setPassengerName('');
    } catch (e) {
      setBookMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="train-page">
      <h2>订火车票</h2>
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

      {error && <div className="form-error">{error}</div>}
      {result && <TrainResult result={result} />}

      {result && result.reachable && (
        <div className="train-book">
          {!booking ? (
            <button className="btn btn-primary" onClick={startBooking}>
              立即购票
            </button>
          ) : (
            <div className="book-form">
              <input
                className="input"
                placeholder="乘车人姓名"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
              />
              <button className="btn btn-primary" onClick={submitBooking}>
                确认购票
              </button>
              <button className="btn" onClick={() => setBooking(false)}>
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

function TrainResult({ result }) {
  if (!result.reachable) {
    return <div className="train-result">该区间暂未开通线路，无法到达。</div>;
  }

  return (
    <div className="train-result">
      <div className="train-summary">
        <strong>{result.from.name}</strong> → <strong>{result.to.name}</strong>
        {result.transfers === 0 ? '（直达）' : `（换乘 ${result.transfers} 次）`}
        <span className="train-fare">票价 {result.fare} 摩拉</span>
      </div>

      <div className="train-segments">
        {result.segments.map((sg, i) => (
          <div key={i}>
            <div className="train-segment">
              <span className="line-dot" style={{ background: sg.line.color || '#888' }} />
              <span className="train-seg-line">{(sg.line && sg.line.name) || '未知线路'}</span>
              {sg.line && sg.line.isLoop && <span className="tag-loop">环线</span>}
              {sg.line && sg.line.operator && <span className="train-seg-op">担当：{sg.line.operator}</span>}
              <span className="train-seg-route">
                {sg.from} → {sg.to}
              </span>
              <span className="train-seg-fare">{sg.fare} 摩拉</span>
            </div>
            {i < result.segments.length - 1 && <div className="train-transfer">↓ 在 {sg.to} 换乘</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
