import { useEffect, useState } from 'react';
import api from '../api.js';

// 首页宣传图轮播：完整显示图片（高度随图片比例自适应，不裁剪），每 5 秒自动切换
export default function Banner() {
  const [banners, setBanners] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api
      .get('/banners')
      .then((res) => setBanners(res.data || []))
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) {
    return <div className="banner-empty">暂无宣传图</div>;
  }

  const safeIndex = index % banners.length;
  const current = banners[safeIndex];

  return (
    <div className="banner">
      <img className="banner-img" src={current.url} alt="" />
      {banners.length > 1 && (
        <div className="banner-dots">
          {banners.map((b, i) => (
            <span
              key={b.id}
              className={`dot ${i === safeIndex ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
