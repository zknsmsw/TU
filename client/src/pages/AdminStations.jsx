import { useEffect, useState } from 'react';
import api from '../api.js';

// 后台 · 站点管理：站点增删改
export default function AdminStations() {
  const [stations, setStations] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ name: '', city: '' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', city: '' });

  const load = () => {
    api
      .get('/stations')
      .then((res) => setStations(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(load, []);

  const add = async () => {
    setMsg(null);
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: '请填写站名' });
      return;
    }
    try {
      const res = await api.post('/stations', form);
      setMsg({ type: 'info', text: res.message || '已添加' });
      setForm({ name: '', city: '' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const startEdit = (s) => {
    setEditing(s.id);
    setEditForm({ name: s.name, city: s.city || '' });
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) {
      setMsg({ type: 'error', text: '站名不能为空' });
      return;
    }
    try {
      const res = await api.put(`/stations/${editing}`, editForm);
      setMsg({ type: 'info', text: res.message || '已保存' });
      setEditing(null);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const del = async (id) => {
    if (!window.confirm('确定删除该站点？')) return;
    try {
      const res = await api.delete(`/stations/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>站点管理</h2>
      <p className="settings-tip">同一个站名出现在两条线路上时，会自动成为换乘站。</p>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-row">
        <input
          className="input"
          placeholder="站名"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="所属城市（可选）"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <button className="btn" onClick={add}>
          添加站点
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>站名</th>
            <th>城市</th>
            <th style={{ width: 150 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) =>
            editing === s.id ? (
              <tr key={s.id}>
                <td>
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  />
                </td>
                <td>
                  <button className="btn" onClick={saveEdit}>
                    保存
                  </button>
                  <button className="btn" onClick={() => setEditing(null)}>
                    取消
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.city || '-'}</td>
                <td>
                  <button className="btn" onClick={() => startEdit(s)}>
                    编辑
                  </button>
                  <button className="btn" onClick={() => del(s.id)}>
                    删除
                  </button>
                </td>
              </tr>
            )
          )}
          {stations.length === 0 && (
            <tr>
              <td colSpan={3}>还没有站点。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
