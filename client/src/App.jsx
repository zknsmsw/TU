import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Train from './pages/Train.jsx';
import Hs from './pages/Hs.jsx';
import Flight from './pages/Flight.jsx';
import Orders from './pages/Orders.jsx';
import AdminLayout from './pages/AdminLayout.jsx';
import AdminLines from './pages/AdminLines.jsx';
import AdminHsTrains from './pages/AdminHsTrains.jsx';
import AdminStations from './pages/AdminStations.jsx';
import AdminAirports from './pages/AdminAirports.jsx';
import AdminFlights from './pages/AdminFlights.jsx';
import AdminBanners from './pages/AdminBanners.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/train" element={<Train />} />
        <Route path="/hs" element={<Hs />} />
        <Route path="/flight" element={<Flight />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/lines" replace />} />
          <Route path="lines" element={<AdminLines />} />
          <Route path="hs-trains" element={<AdminHsTrains />} />
          <Route path="stations" element={<AdminStations />} />
          <Route path="airports" element={<AdminAirports />} />
          <Route path="flights" element={<AdminFlights />} />
          <Route path="banners" element={<AdminBanners />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
