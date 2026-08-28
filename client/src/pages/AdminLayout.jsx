import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../store.js';

// 后台总布局：左侧分类导航 + 右侧内容区（仅管理员可见）
const items = [
  { to: '/admin/lines', label: '线路管理' },
  { to: '/admin/hs-trains', label: '车次管理' },
  { to: '/admin/stations', label: '站点管理' },
  { to: '/admin/airports', label: '机场管理' },
  { to: '/admin/flights', label: '航班管理' },
  { to: '/admin/banners', label: '宣传图管理' },
  { to: '/admin/settings', label: '票务设置' }
];

export default function AdminLayout() {
  const user = useAuth((s) => s.user);

  if (!user) {
    return (
      <div className="plain-page">
        <p>请先登录后再访问后台。</p>
        <Link className="btn btn-primary" to="/login">
          去登录
        </Link>
      </div>
    );
  }
  if (user.role !== 'admin') {
    return <div className="plain-page">无权限：只有管理员可以访问后台。</div>;
  }
  if (user.mustChangePassword) {
    return (
      <div className="plain-page">
        <p>管理员首次登录需要先修改初始密码，之后才能进入后台。</p>
        <Link className="btn btn-primary" to="/change-password">
          去修改密码
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-side">
        <div className="admin-side-title">后台管理</div>
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              isActive ? 'admin-side-link active' : 'admin-side-link'
            }
          >
            {it.label}
          </NavLink>
        ))}
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
