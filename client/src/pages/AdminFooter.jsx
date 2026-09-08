import { useEffect, useState } from 'react';
import api from '../api.js';

// 后台 · 页脚附加声明：在网站底部默认版权声明下方追加 / 删除声明行
export default function AdminFooter() {
  const [notices, setNotices] = useState([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get('/settings/footer')
      .then((res) => setNotices(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(() => {
    load();
  }, []);

  const onAdd = async () => {
    if (!text.trim()) {
      setMsg({ type: 'error', text: '请输入声明内容' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post('/settings/footer', { text });
      setMsg({ type: 'info', text: res.message || '已添加' });
      setText('');
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('确定删除这条声明？')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.delete(`/settings/footer/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>页脚附加声明</h2>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-panel">
        <h3>添加声明</h3>
        <p className="settings-tip">
          添加后会显示在网站底部「默认版权声明」下方。每条最多 200 字。
        </p>
        <div className="admin-row">
          <input
            className="input"
            style={{ flex: 1 }}
            maxLength={200}
            placeholder="例如：本页面仅供学习交流，请勿用于商业用途"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
          <button className="btn" onClick={onAdd} disabled={busy}>
            添加
          </button>
        </div>
      </div>

      <div className="admin-panel">
        <h3>现有声明</h3>
        {notices.length === 0 ? (
          <p className="muted">还没有添加附加声明。</p>
        ) : (
          <div className="admin-list">
            {notices.map((n) => (
              <div key={n.id} className="admin-item">
                <span>{n.text}</span>
                <button className="btn" onClick={() => onDelete(n.id)} disabled={busy}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
