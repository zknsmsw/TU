import { useEffect, useState } from 'react';
import api from '../api.js';

// 后台 · 宣传图管理：首页轮播图 + 导航栏标题图
export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [logoUrl, setLogoUrl] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get('/banners')
      .then((res) => setBanners(res.data || []))
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  const loadLogo = () => {
    api
      .get('/settings/logo')
      .then((res) => setLogoUrl(res.data && res.data.url ? res.data.url : null))
      .catch(() => setLogoUrl(null));
  };
  useEffect(() => {
    load();
    loadLogo();
  }, []);

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api.post('/banners', { data: reader.result });
        setMsg({ type: 'info', text: res.message || '上传成功' });
        load();
      } catch (err) {
        setMsg({ type: 'error', text: err.message });
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onDelete = async (id) => {
    if (!window.confirm('确定删除这张宣传图？')) return;
    try {
      const res = await api.delete(`/banners/${id}`);
      setMsg({ type: 'info', text: res.message || '已删除' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const onFileLogo = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api.post('/settings/logo', { data: reader.result });
        setMsg({ type: 'info', text: res.message || '已更新' });
        loadLogo();
      } catch (err) {
        setMsg({ type: 'error', text: err.message });
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onRemoveLogo = async () => {
    if (!window.confirm('确定移除标题图？')) return;
    try {
      const res = await api.delete('/settings/logo');
      setMsg({ type: 'info', text: res.message || '已移除' });
      loadLogo();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div>
      <h2>宣传图管理</h2>
      {msg && <div className={msg.type === 'error' ? 'form-error' : 'form-info'}>{msg.text}</div>}

      <div className="admin-panel">
        <h3>首页轮播图</h3>
        <p className="settings-tip">首页自动轮播展示的图片：</p>
        <div className="admin-row">
          <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
          <span>{busy ? '上传中…' : '支持 png / jpeg / gif / webp，最大 5MB'}</span>
        </div>
        <div className="admin-list">
          {banners.length === 0 && <p>还没有宣传图。</p>}
          {banners.map((b) => (
            <div key={b.id} className="admin-item">
              <img src={b.url} alt="" />
              <span>{b.url}</span>
              <button className="btn" onClick={() => onDelete(b.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel">
        <h3>导航栏标题图（Logo）</h3>
        <div className="admin-row">
          <input type="file" accept="image/*" onChange={onFileLogo} disabled={busy} />
          <span>{busy ? '上传中…' : '支持 png / jpeg / gif / webp，最大 5MB'}</span>
        </div>
        <div className="settings-preview">
          当前标题图：
          {logoUrl ? (
            <>
              <img src={logoUrl} alt="标题图" />
              <button className="btn" onClick={onRemoveLogo}>
                移除标题图
              </button>
            </>
          ) : (
            <span className="muted">未设置</span>
          )}
        </div>
      </div>
    </div>
  );
}
