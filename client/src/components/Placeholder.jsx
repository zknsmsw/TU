import { Link } from 'react-router-dom';

export default function Placeholder({ icon, title, desc }) {
  return (
    <div className="placeholder">
      <div className="placeholder-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{desc}</p>
      <Link className="btn btn-primary" to="/">
        返回首页
      </Link>
    </div>
  );
}
