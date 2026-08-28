import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../store.js';

// 后台 · 宣传图管理（仅管理员可用，地址 /admin）
export default function Admin() {
  const user = useAuth((s) => s.user);
  const [banners, setBanners] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get('/banners')
      .then((res) => setBanners(res.data || []))
      .catch((e) => setMessage(e.message));
  };
  useEffect(load, []);

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMessage('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api.post('/banners', { data: reader.result });
        setMessage(res.message || '上传成功');
        load();
      } catch (err) {
        setMessage(err.message);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onDelete = async (id) => {
    if (!window.confirm('确定删除这张宣传图？')) return;
    try {
      await api.delete(`/banners/${id}`);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user) {
    return <div className="plain-page">请先登录后再访问后台（右上角登录）。</div>;
  }
  if (user.role !== 'admin') {
    return <div className="plain-page">无权限：只有管理员可以访问后台。</div>;
  }

  return (
    <div className="plain-page">
      <h2>后台 · 宣传图管理</h2>
      {message && <div className="form-error">{message}</div>}

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
  );
}
