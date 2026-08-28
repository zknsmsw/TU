import { useEffect, useState } from 'react';
import api from '../api.js';
import AirportSelect from '../components/AirportSelect.jsx';

// 后台 · 航班管理：航班增删改（班次 / 起降机场 / 起落时间 / 票价）
export default function AdminFlights() {
  const [flights, setFlights] = useState([]);
  const [airports, setAirports] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    flightNo: '',
    fromAirportId: '',
    toAirportId: '',
    departTime: '',
    arriveTime: '',
    price: '',
    operator: ''
  });
  const [expandedId, setExpandedId] = useState(null);

  const loadFlights = () => {
    api
      .get('/flight/flights')
      .then((res) => setFlights(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  const loadAirports = () => {
    api
      .get('/flight/airports')
      .then((res) => setAirports(res.data || []))
      .catch(() => {});
  };
  useEffect(() => {
    loadFlights();
    loadAirports();
  }, []);

  const createFlight = async () => {
    setMsg(null);
    try {
      const res = await api.post('/flight/flights', form);
      setMsg({ type: 'info', text: res.message || '已创建' });
      setForm({
        flightNo: '',
        fromAirportId: '',
        toAirportId: '',
        departTime: '',
        arriveTime: '',
        price: '',
        operator: ''
      });
      loadFlights();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const updateFlight = async (id, patch) => {
    try {
      const res = await api.put(`/flight/flights/${id}`, patch);
      setMsg({ type: 'info', text: res.message || '已保存' });
      loadFlights();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const deleteFlight = async (id) => {
    if (!window.confirm('确定删除该航班？')) return;
    try {
      const res = await api.delete(`/flight/flights/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      if (expandedId === id) setExpandedId(null);
      loadFlights();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const setEdit = (field, value) => {
    setFlights((list) => list.map((f) => (f.id === expandedId ? { ...f, [field]: value } : f)));
  };

  return (
    <div>
      <h2>航班管理</h2>
      <p className="settings-tip">
        一条航班 = 一个班次：填写航班号、起降机场、起飞/降落时间和票价。订票时按起降机场查询。
      </p>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-panel">
        <h3>新增航班</h3>
        <div className="admin-row">
          <input
            className="input"
            placeholder="航班号（如 CA1234）"
            value={form.flightNo}
            onChange={(e) => setForm({ ...form, flightNo: e.target.value })}
            maxLength={10}
          />
          <input
            className="input"
            placeholder="担当企业（可选）"
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
          />
        </div>
        <div className="admin-row">
          <AirportSelect
            airports={airports}
            value={form.fromAirportId}
            onChange={(id) => setForm({ ...form, fromAirportId: id })}
            placeholder="起飞机场"
          />
          <AirportSelect
            airports={airports}
            value={form.toAirportId}
            onChange={(id) => setForm({ ...form, toAirportId: id })}
            placeholder="到达机场"
          />
          <input
            className="input time-input"
            placeholder="起飞 HH:mm"
            value={form.departTime}
            onChange={(e) => setForm({ ...form, departTime: e.target.value })}
          />
          <input
            className="input time-input"
            placeholder="降落 HH:mm"
            value={form.arriveTime}
            onChange={(e) => setForm({ ...form, arriveTime: e.target.value })}
          />
          <input
            className="input fare-input"
            placeholder="票价"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <button className="btn" onClick={createFlight}>
            创建航班
          </button>
        </div>
      </div>

      <div className="line-list">
        {flights.length === 0 && <p>还没有航班，先在上方创建一条。</p>}
        {flights.map((f) => (
          <div key={f.id} className="line-card">
            <div className="line-card-head">
              <span className="hs-no">{f.flightNo}</span>
              {f.operator && <span className="muted">担当：{f.operator}</span>}
              <span className="muted">
                {f.fromName}（{f.fromCode}） → {f.toName}（{f.toCode}）
              </span>
              <span className="muted">
                {f.departTime} 起飞 · {f.arriveTime} 降落
              </span>
              <span className="muted">{f.price} 摩拉</span>
              <div className="line-card-actions">
                <button className="btn" onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                  {expandedId === f.id ? '收起' : '编辑'}
                </button>
                <button className="btn" onClick={() => deleteFlight(f.id)}>
                  删除
                </button>
              </div>
            </div>

            {expandedId === f.id && (
              <div className="line-detail">
                <div className="admin-row">
                  <input
                    className="input"
                    placeholder="航班号"
                    value={f.flightNo}
                    onChange={(e) => setEdit('flightNo', e.target.value)}
                    maxLength={10}
                  />
                  <input
                    className="input"
                    placeholder="担当企业（可选）"
                    value={f.operator || ''}
                    onChange={(e) => setEdit('operator', e.target.value)}
                  />
                </div>
                <div className="admin-row">
                  <AirportSelect
                    airports={airports}
                    value={f.fromAirportId}
                    onChange={(id) => setEdit('fromAirportId', id)}
                    placeholder="起飞机场"
                  />
                  <AirportSelect
                    airports={airports}
                    value={f.toAirportId}
                    onChange={(id) => setEdit('toAirportId', id)}
                    placeholder="到达机场"
                  />
                  <input
                    className="input time-input"
                    placeholder="起飞 HH:mm"
                    value={f.departTime}
                    onChange={(e) => setEdit('departTime', e.target.value)}
                  />
                  <input
                    className="input time-input"
                    placeholder="降落 HH:mm"
                    value={f.arriveTime}
                    onChange={(e) => setEdit('arriveTime', e.target.value)}
                  />
                  <input
                    className="input fare-input"
                    placeholder="票价"
                    value={f.price}
                    onChange={(e) => setEdit('price', e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={() => updateFlight(f.id, { ...f })}>
                    保存
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
