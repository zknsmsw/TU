import { useEffect, useState } from 'react';
import api from '../api.js';
import StationSelect from '../components/StationSelect.jsx';

// 后台 · 线路管理：线路增删改、站点顺序、站间票价
export default function AdminLines() {
  const [lines, setLines] = useState([]);
  const [stations, setStations] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#888888', description: '', operator: '', isLoop: false });
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [stopForm, setStopForm] = useState({ stationId: '', kmFromStart: '' });

  const loadLines = () => {
    api
      .get('/train/lines')
      .then((res) => setLines(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  const loadStations = () => {
    api
      .get('/stations')
      .then((res) => setStations(res.data || []))
      .catch(() => {});
  };
  useEffect(() => {
    loadLines();
    loadStations();
  }, []);

  const refreshDetail = (lineId) => {
    api
      .get(`/train/lines/${lineId}`)
      .then((res) => setDetail(res.data))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };

  const toggle = (lineId) => {
    if (expandedId === lineId) {
      setExpandedId(null);
      setDetail(null);
    } else {
      setExpandedId(lineId);
      refreshDetail(lineId);
    }
  };

  const createLine = async () => {
    setMsg(null);
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: '请填写线路名称' });
      return;
    }
    try {
      const res = await api.post('/train/lines', form);
      setMsg({ type: 'info', text: res.message || '已创建' });
      setForm({ name: '', color: '#888888', description: '', operator: '', isLoop: false });
      loadLines();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const updateLine = async () => {
    if (!detail) return;
    try {
      const res = await api.put(`/train/lines/${detail.line.id}`, {
        name: detail.line.name,
        color: detail.line.color,
        description: detail.line.description,
        operator: detail.line.operator,
        isLoop: detail.line.isLoop
      });
      setMsg({ type: 'info', text: res.message || '已保存' });
      loadLines();
      refreshDetail(detail.line.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const deleteLine = async (id) => {
    if (!window.confirm('确定删除该线路？')) return;
    try {
      const res = await api.delete(`/train/lines/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      setExpandedId(null);
      setDetail(null);
      loadLines();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  // ---- 站点管理 ----

  const addStop = async () => {
    if (!detail) return;
    if (!stopForm.stationId) {
      setMsg({ type: 'error', text: '请选择站点' });
      return;
    }
    try {
      const res = await api.post(`/train/lines/${detail.line.id}/stops`, {
        stationId: stopForm.stationId,
        kmFromStart: stopForm.kmFromStart
      });
      setMsg({ type: 'info', text: res.message || '已添加' });
      setStopForm({ stationId: '', kmFromStart: '' });
      refreshDetail(detail.line.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const removeStop = async (stopId) => {
    try {
      const res = await api.delete(`/train/stops/${stopId}`);
      setMsg({ type: 'info', text: res.message || '已移除' });
      refreshDetail(detail.line.id);
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
      const res = await api.put(`/train/lines/${detail.line.id}/reorder`, { stopIds: arr });
      setMsg({ type: 'info', text: res.message || '顺序已更新' });
      refreshDetail(detail.line.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const saveKm = async (stopId, value) => {
    try {
      await api.put(`/train/stops/${stopId}`, { kmFromStart: value });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  // ---- 站间票价 ----

  const saveEdgeFare = async (edge, value) => {
    if (!detail) return;
    try {
      const res = await api.put(`/train/lines/${detail.line.id}/edge-fares`, {
        stationAId: edge.fromStationId,
        stationBId: edge.toStationId,
        fare: value
      });
      setMsg({ type: 'info', text: res.message || '已保存' });
      refreshDetail(detail.line.id);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>线路管理</h2>
      <p className="settings-tip">线路是一串有序站点，两条线路经过同名站即自动成为换乘站。</p>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-panel">
        <h3>新增线路</h3>
        <div className="admin-row">
          <input
            className="input"
            placeholder="线路名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            title="代表颜色"
          />
          <input
            className="input"
            placeholder="说明（可选）"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            className="input"
            placeholder="担当企业（可选）"
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.isLoop}
              onChange={(e) => setForm({ ...form, isLoop: e.target.checked })}
            />
            环线
          </label>
          <button className="btn" onClick={createLine}>
            创建线路
          </button>
        </div>
      </div>

      <div className="line-list">
        {lines.length === 0 && <p>还没有线路，先在上方创建一条。</p>}
        {lines.map((l) => (
          <div key={l.id} className="line-card">
            <div className="line-card-head">
              <span className="color-swatch" style={{ background: l.color }} />
              <strong>{l.name}</strong>
              {l.isLoop && <span className="tag-loop">环线</span>}
              <span className="muted">共 {l.stopCount} 站</span>
              <span className="muted">担当：{l.operator || '未设置'}</span>
              <div className="line-card-actions">
                <button className="btn" onClick={() => toggle(l.id)}>
                  {expandedId === l.id ? '收起' : '管理'}
                </button>
                <button className="btn" onClick={() => deleteLine(l.id)}>
                  删除
                </button>
              </div>
            </div>

            {expandedId === l.id && detail && detail.line.id === l.id && (
              <div className="line-detail">
                <div className="admin-row">
                  <input
                    className="input"
                    placeholder="线路名称"
                    value={detail.line.name}
                    onChange={(e) => setDetail({ ...detail, line: { ...detail.line, name: e.target.value } })}
                  />
                  <input
                    type="color"
                    value={detail.line.color}
                    onChange={(e) => setDetail({ ...detail, line: { ...detail.line, color: e.target.value } })}
                  />
                  <input
                    className="input"
                    placeholder="说明（可选）"
                    value={detail.line.description}
                    onChange={(e) => setDetail({ ...detail, line: { ...detail.line, description: e.target.value } })}
                  />
                  <input
                    className="input"
                    placeholder="担当企业（可选）"
                    value={detail.line.operator || ''}
                    onChange={(e) => setDetail({ ...detail, line: { ...detail.line, operator: e.target.value } })}
                  />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={!!detail.line.isLoop}
                      onChange={(e) =>
                        setDetail({ ...detail, line: { ...detail.line, isLoop: e.target.checked } })
                      }
                    />
                    环线（末站连回首站）
                  </label>
                  <button className="btn" onClick={updateLine}>
                    保存线路信息
                  </button>
                </div>

                <h4>途经站点（顺序）</h4>
                {detail.stops.map((s, i) => (
                  <div key={s.id} className="stop-row">
                    <span className="stop-seq">{i + 1}.</span>
                    <span className="stop-name">{s.stationName}</span>
                    <input
                      className="input km-input"
                      placeholder="里程(可选)"
                      defaultValue={s.kmFromStart ?? ''}
                      onBlur={(e) => saveKm(s.id, e.target.value)}
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
                    className="input km-input"
                    placeholder="里程(可选)"
                    value={stopForm.kmFromStart}
                    onChange={(e) => setStopForm({ ...stopForm, kmFromStart: e.target.value })}
                  />
                  <button className="btn" onClick={addStop}>
                    添加站点
                  </button>
                </div>

                <h4>站间票价（留空 = 使用默认票价）</h4>
                {detail.edges.length === 0 && <p className="muted">请先至少添加两个站点。</p>}
                <div className="edge-list">
                  {detail.edges.map((edge) => (
                    <div key={`${edge.fromStopId}-${edge.toStopId}`} className="edge-row">
                      <span className="edge-route">
                        {edge.fromName} → {edge.toName}
                      </span>
                      <input
                        className="input fare-input"
                        placeholder={`默认 ${detail.defaultFare}`}
                        defaultValue={edge.fare ?? ''}
                        onBlur={(e) => saveEdgeFare(edge, e.target.value)}
                      />
                      <span className="muted">摩拉</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
