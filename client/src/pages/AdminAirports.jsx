import { useEffect, useState } from 'react';
import api from '../api.js';

// 后台 · 机场管理：机场增删改（名称 / 机场代码 / 城市）
export default function AdminAirports() {
  const [airports, setAirports] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', city: '' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', code: '', city: '' });

  const load = () => {
    api
      .get('/flight/airports')
      .then((res) => setAirports(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(load, []);

  const add = async () => {
    setMsg(null);
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: '请填写机场名称' });
      return;
    }
    if (!form.code.trim()) {
      setMsg({ type: 'error', text: '请填写机场代码（如 PVG）' });
      return;
    }
    try {
      const res = await api.post('/flight/airports', form);
      setMsg({ type: 'info', text: res.message || '已添加' });
      setForm({ name: '', code: '', city: '' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setEditForm({ name: a.name, code: a.code, city: a.city || '' });
  };

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.code.trim()) {
      setMsg({ type: 'error', text: '机场名称和代码不能为空' });
      return;
    }
    try {
      const res = await api.put(`/flight/airports/${editing}`, editForm);
      setMsg({ type: 'info', text: res.message || '已保存' });
      setEditing(null);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const del = async (id) => {
    if (!window.confirm('确定删除该机场？')) return;
    try {
      const res = await api.delete(`/flight/airports/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>机场管理</h2>
      <p className="settings-tip">机场代码为 2~4 位字母（如 PVG）。订票时输入机场名称或代码都可以搜索到。</p>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-row">
        <input
          className="input"
          placeholder="机场名称"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input code-input"
          placeholder="机场代码"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          maxLength={4}
        />
        <input
          className="input"
          placeholder="城市（可选）"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <button className="btn" onClick={add}>
          添加机场
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>机场名称</th>
            <th>代码</th>
            <th>城市</th>
            <th style={{ width: 150 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {airports.map((a) =>
            editing === a.id ? (
              <tr key={a.id}>
                <td>
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input code-input"
                    value={editForm.code}
                    onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                    maxLength={4}
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
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>
                  <span className="hs-no">{a.code}</span>
                </td>
                <td>{a.city || '-'}</td>
                <td>
                  <button className="btn" onClick={() => startEdit(a)}>
                    编辑
                  </button>
                  <button className="btn" onClick={() => del(a.id)}>
                    删除
                  </button>
                </td>
              </tr>
            )
          )}
          {airports.length === 0 && (
            <tr>
              <td colSpan={4}>还没有机场，先在上方添加一个。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
