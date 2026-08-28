import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="placeholder">
      <div className="placeholder-icon">🧭</div>
      <h2>404</h2>
      <p>你似乎迷路了，这片区域不在提瓦特地图上。</p>
      <Link className="btn btn-primary" to="/">
        返回首页
      </Link>
    </div>
  );
}
