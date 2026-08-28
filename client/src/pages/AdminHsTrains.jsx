import { useEffect, useState } from 'react';
import api from '../api.js';
import StationSelect from '../components/StationSelect.jsx';

// 后台 · 车次管理：高铁车次增删改、经停站到发时间与累计票价
export default function AdminHsTrains() {
  const [trains, setTrains] = useState([]);
  const [stations, setStations] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ trainNo: '', name: '', operator: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [stopForm, setStopForm] = useState({ stationId: '', arriveTime: '', departTime: '', priceFromOrigin: '' });

  const loadTrains = () => {
    api
      .get('/hs/trains')
      .then((res) => setTrains(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  const loadStations = () => {
    api
      .get('/stations')
      .then((res) => setStations(res.data || []))
      .catch(() => {});
  };
  useEffect(() => {
    loadTrains();
    loadStations();
  }, []);

  const refreshDetail = (trainId) => {
    api
      .get(`/hs/trains/${trainId}`)
      .then((res) => setDetail(res.data))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };

  const toggle = (trainId) => {
    if (expandedId === trainId) {
      setExpandedId(null);
      setDetail(null);
    } else {
      setExpandedId(trainId);
      refreshDetail(trainId);
    }
  };

  const createTrain = async () => {
    setMsg(null);
    if (!form.trainNo.trim()) {
      setMsg({ type: 'error', text: '请填写车次号' });
      return;
    }
    try {
      const res = await api.post('/hs/trains', form);
      setMsg({ type: 'info', text: res.message || '已创建' });
      setForm({ trainNo: '', name: '', operator: '' });
      loadTrains();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const updateTrain = async () => {
    if (!detail) return;
    try {
      const res = await api.put(`/hs/trains/${detail.train.id}`, {
        trainNo: detail.train.trainNo,
        name: detail.train.name,
        operator: detail.train.operator
      });
      setMsg({ type: 'info', text: res.message || '已保存' });
      loadTrains();
      refreshDetail(detail.train.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const deleteTrain = async (id) => {
    if (!window.confirm('确定删除该车次？')) return;
    try {
      const res = await api.delete(`/hs/trains/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      setExpandedId(null);
      setDetail(null);
      loadTrains();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const addStop = async () => {
    if (!detail) return;
    if (!stopForm.stationId) {
      setMsg({ type: 'error', text: '请选择站点' });
      return;
    }
    try {
      const res = await api.post(`/hs/trains/${detail.train.id}/stops`, stopForm);
      setMsg({ type: 'info', text: res.message || '已添加' });
      setStopForm({ stationId: '', arriveTime: '', departTime: '', priceFromOrigin: '' });
      refreshDetail(detail.train.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const removeStop = async (stopId) => {
    try {
      const res = await api.delete(`/hs/stops/${stopId}`);
      setMsg({ type: 'info', text: res.message || '已移除' });
      refreshDetail(detail.train.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const moveStop = async (index, dir) => {
    if (!detail) return;
    const stops = detail.stops;
    const j = index + dir;
    if (j < 0 || j >= stops.length) return;
    const arr = stops.map((s) => s.id);
    const t = arr[index];
    arr[index] = arr[j];
    arr[j] = t;
    try {
      const res = await api.put(`/hs/trains/${detail.train.id}/reorder`, { stopIds: arr });
      setMsg({ type: 'info', text: res.message || '顺序已更新' });
      refreshDetail(detail.train.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const saveStop = async (stopId, patch) => {
    try {
      await api.put(`/hs/stops/${stopId}`, patch);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>车次管理</h2>
      <p className="settings-tip">
        高铁按车次运行：每站填到/发时间和"从始发站的累计票价"（两站票价 = 到站累计价 − 出发站累计价）。首站只填发车时间，末站只填到站时间。
      </p>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-panel">
        <h3>新增车次</h3>
        <div className="admin-row">
          <input
            className="input"
            placeholder="车次号（如 G1001）"
            value={form.trainNo}
            onChange={(e) => setForm({ ...form, trainNo: e.target.value })}
          />
          <input
            className="input"
            placeholder="名称（可选）"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="担当企业（可选）"
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
          />
          <button className="btn" onClick={createTrain}>
            创建车次
          </button>
        </div>
      </div>

      <div className="line-list">
        {trains.length === 0 && <p>还没有车次，先在上方创建一条。</p>}
        {trains.map((t) => (
          <div key={t.id} className="line-card">
            <div className="line-card-head">
              <strong>{t.trainNo}</strong>
              {t.name && <span className="muted">{t.name}</span>}
              <span className="muted">共 {t.stopCount} 站</span>
              <span className="muted">担当：{t.operator || '未设置'}</span>
              <div className="line-card-actions">
                <button className="btn" onClick={() => toggle(t.id)}>
                  {expandedId === t.id ? '收起' : '管理'}
                </button>
                <button className="btn" onClick={() => deleteTrain(t.id)}>
                  删除
                </button>
              </div>
            </div>

            {expandedId === t.id && detail && detail.train.id === t.id && (
              <div className="line-detail">
                <div className="admin-row">
                  <input
                    className="input"
                    placeholder="车次号"
                    value={detail.train.trainNo}
                    onChange={(e) => setDetail({ ...detail, train: { ...detail.train, trainNo: e.target.value } })}
                  />
                  <input
                    className="input"
                    placeholder="名称（可选）"
                    value={detail.train.name}
                    onChange={(e) => setDetail({ ...detail, train: { ...detail.train, name: e.target.value } })}
                  />
                  <input
                    className="input"
                    placeholder="担当企业（可选）"
                    value={detail.train.operator}
                    onChange={(e) => setDetail({ ...detail, train: { ...detail.train, operator: e.target.value } })}
                  />
                  <button className="btn" onClick={updateTrain}>
                    保存车次信息
                  </button>
                </div>

                <h4>经停站（首站只发车、末站只到站）</h4>
                {detail.stops.map((s, i) => (
                  <div key={s.id} className="stop-row">
                    <span className="stop-seq">{i + 1}.</span>
                    <span className="stop-name">{s.stationName}</span>
                    {i !== 0 && (
                      <input
                        className="input time-input"
                        placeholder="到站"
                        defaultValue={s.arriveTime}
                        onBlur={(e) => saveStop(s.id, { arriveTime: e.target.value })}
                      />
                    )}
                    {i !== detail.stops.length - 1 && (
                      <input
                        className="input time-input"
                        placeholder="发车"
                        defaultValue={s.departTime}
                        onBlur={(e) => saveStop(s.id, { departTime: e.target.value })}
                      />
                    )}
                    <input
                      className="input fare-input"
                      placeholder="累计票价"
                      defaultValue={s.priceFromOrigin ?? ''}
                      onBlur={(e) => saveStop(s.id, { priceFromOrigin: e.target.value })}
                    />
                    <button className="btn" onClick={() => moveStop(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      className="btn"
                      onClick={() => moveStop(i, 1)}
                      disabled={i === detail.stops.length - 1}
                    >
                      ↓
                    </button>
                    <button className="btn" onClick={() => removeStop(s.id)}>
                      移除
                    </button>
                  </div>
                ))}

                <div className="admin-row">
                  <StationSelect
                    stations={stations.filter((st) => !detail.stops.some((s) => s.stationId === st.id))}
                    value={stopForm.stationId}
                    onChange={(id) => setStopForm({ ...stopForm, stationId: id })}
                    placeholder="搜索并选择站点"
                  />
                  <input
                    className="input time-input"
                    placeholder="到站时间"
                    value={stopForm.arriveTime}
                    onChange={(e) => setStopForm({ ...stopForm, arriveTime: e.target.value })}
                  />
                  <input
                    className="input time-input"
                    placeholder="发车时间"
                    value={stopForm.departTime}
                    onChange={(e) => setStopForm({ ...stopForm, departTime: e.target.value })}
                  />
                  <input
                    className="input fare-input"
                    placeholder="累计票价"
                    value={stopForm.priceFromOrigin}
                    onChange={(e) => setStopForm({ ...stopForm, priceFromOrigin: e.target.value })}
                  />
                  <button className="btn" onClick={addStop}>
                    添加站点
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
