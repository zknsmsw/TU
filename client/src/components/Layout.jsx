import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store.js';
import api from '../api.js';

const links = [
  { to: '/train', label: '订火车票' },
  { to: '/hs', label: '订高铁票' },
  { to: '/flight', label: '订飞机票' },
  { to: '/orders', label: '我的订单' }
];

export default function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [footerNotices, setFooterNotices] = useState([]);

  useEffect(() => {
    api
      .get('/settings/logo')
      .then((res) => setLogoUrl(res.data && res.data.url ? res.data.url : null))
      .catch(() => setLogoUrl(null));
    // 页脚附加声明（管理员在后台维护）
    api
      .get('/settings/footer')
      .then((res) => setFooterNotices(res.data || []))
      .catch(() => setFooterNotices([]));
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    // 通知服务端清除会话 Cookie（失败也继续本地登出）
    api.post('/auth/logout').catch(() => {});
    logout();
    navigate('/');
  };

  return (
    <div className="app">
      <header className="navbar">
        <NavLink to="/" className="brand">
          {logoUrl && (
            <img
              className="brand-logo"
              src={logoUrl}
              alt="提瓦特交通联合"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </NavLink>

        <nav className="nav-links">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-user">
          {user ? (
            <div className="user-menu-wrap">
              <button className="user-name-btn" onClick={() => setMenuOpen(!menuOpen)}>
                {user.username} ▾
              </button>
              {menuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="user-menu">
                    {user.role === 'admin' && (
                      <NavLink to="/admin" onClick={() => setMenuOpen(false)}>
                        后台管理
                      </NavLink>
                    )}
                    <NavLink to="/change-password" onClick={() => setMenuOpen(false)}>
                      修改密码
                    </NavLink>
                    <NavLink to="/orders" onClick={() => setMenuOpen(false)}>
                      我的订单
                    </NavLink>
                    <button className="menu-logout" onClick={handleLogout}>
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              登录
            </NavLink>
          )}
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <p>提瓦特交通联合 · 纯虚构爱好者项目，与米哈游及任何现实运输系统无关</p>
        {footerNotices.map((n) => (
          <p key={n.id} className="footer-notice">
            {n.text}
          </p>
        ))}
      </footer>
    </div>
  );
}
