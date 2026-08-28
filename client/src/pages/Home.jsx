import Banner from '../components/Banner.jsx';

// 首页：只保留宣传图区域（导航栏在 Layout 里）
export default function Home() {
  return (
    <div className="home">
      <Banner />
    </div>
  );
}
