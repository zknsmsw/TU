import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../store.js';

// 修改密码：登录后通过用户名下拉菜单进入
export default function ChangePassword() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>修改密码</h2>
          <p className="auth-sub">请先登录后再修改密码。</p>
          <Link className="btn btn-primary btn-block" to="/login">
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      logout();
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>修改密码</h2>
        <p className="auth-sub">修改成功后需要重新登录</p>

        <label>原密码</label>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder="输入原密码"
        />

        <label>新密码</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="至少 6 位"
        />

        <label>确认新密码</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="再次输入新密码"
        />

        {error && <div className="form-error">{error}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? '提交中…' : '确认修改'}
        </button>
      </form>
    </div>
  );
}
