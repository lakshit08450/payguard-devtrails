import { Activity, ArrowLeft, LayoutDashboard, LogOut, Settings2, Shield, SwitchCamera } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';

export default function AdminLayout() {
  const navigate = useNavigate();
  const { logoutAdmin } = useApp();

  const handleLogout = () => {
    logoutAdmin();
    navigate('/', { replace: true });
  };

  const getNavClass = ({ isActive }) => {
    return isActive ? 'admin-layout-link admin-layout-link-active' : 'admin-layout-link';
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button className="btn-outline" onClick={() => navigate('/', { replace: true })} style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }}>
            <ArrowLeft size={15} /> Back to Role Selection
          </button>

          <div className="admin-brand" style={{ marginBottom: 22 }}>
            <div className="admin-brand-mark">PG</div>
            <div>
              <strong>Admin Portal</strong>
              <span>AI Insurance Control Center</span>
            </div>
          </div>

          <div className="admin-nav" style={{ marginBottom: 18 }}>
            <NavLink to="/admin/dashboard" className={getNavClass}><LayoutDashboard size={16} /> Dashboard</NavLink>
            <NavLink to="/admin/analytics" className={getNavClass}><Activity size={16} /> Analytics</NavLink>
            <NavLink to="/admin/control" className={getNavClass}><Settings2 size={16} /> Control Panel</NavLink>
          </div>

          <button className="btn-outline" onClick={() => navigate('/worker')} style={{ width: '100%', justifyContent: 'center' }}>
            <SwitchCamera size={15} /> Switch to Worker App
          </button>
        </div>

        <button className="btn-outline" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
          <LogOut size={15} /> Logout
        </button>
      </aside>

      <main className="admin-content">
        <div className="admin-kicker" style={{ marginBottom: 12, display: 'inline-flex' }}>
          <Shield size={13} style={{ marginRight: 6 }} /> Admin System
        </div>
        <Outlet />
      </main>
    </div>
  );
}
