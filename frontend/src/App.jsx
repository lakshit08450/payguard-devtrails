import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './contexts/AppContext';
import Navbar from './components/Navbar';
import AdminLayout from './components/AdminLayout';
import AuthPage from './pages/AuthPage';
import WorkerAuthPage from './pages/WorkerAuthPage';
import RegisterFlow from './pages/RegisterFlow';
import HomePage from './pages/HomePage';
import { PolicyPage } from './pages/PolicyPage';
import PremiumPage from './pages/PremiumPage';
import ClaimsPage from './pages/ClaimsPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage';
import AdminControlPage from './pages/AdminControlPage';

function AppLoading() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
      <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <span style={{ color: 'var(--text2)', fontSize: 14 }}>Loading PayGuard...</span>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { admin, loading } = useApp();
  if (loading) return <AppLoading />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireWorker({ children, allowUnregistered = false }) {
  const { user, loading } = useApp();

  if (loading) return <AppLoading />;
  if (!user) return <Navigate to="/worker" replace />;
  if (!allowUnregistered && !user.policy?.plan) return <Navigate to="/worker/register" replace />;
  return children;
}

function WorkerEntry() {
  const { user, loading } = useApp();

  if (loading) return <AppLoading />;
  if (!user) return <WorkerAuthPage />;
  if (!user.policy?.plan) return <Navigate to="/worker/register" replace />;
  return <Navigate to="/worker/home" replace />;
}

function WorkerShell() {
  const { user, loading } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return <AppLoading />;

  const segment = location.pathname.replace('/worker', '').replace(/^\//, '') || 'home';
  const page = ['home', 'policy', 'premium', 'claims'].includes(segment) ? segment : 'home';

  const go = (nextPage) => {
    const target = nextPage === 'home' ? '/worker' : `/worker/${nextPage}`;
    navigate(target);
    window.scrollTo(0, 0);
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar page={page} go={go} />
      <Outlet />
    </div>
  );
}

export default function App() {
  const { admin, loading } = useApp();

  if (loading) return <AppLoading />;

  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/worker" element={<WorkerEntry />} />
      <Route
        path="/worker/register"
        element={(
          <RequireWorker allowUnregistered>
            <RegisterFlow />
          </RequireWorker>
        )}
      />
      <Route
        path="/worker"
        element={(
          <RequireWorker>
            <WorkerShell />
          </RequireWorker>
        )}
      >
        <Route path="home" element={<HomePage />} />
        <Route path="policy" element={<PolicyPage />} />
        <Route path="premium" element={<PremiumPage />} />
        <Route path="claims" element={<ClaimsPage />} />
      </Route>

      <Route path="/admin/login" element={admin ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />} />
      <Route
        path="/admin"
        element={(
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        )}
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="control" element={<AdminControlPage />} />
      </Route>
      <Route path="/admin/*" element={<Navigate to="/admin/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
