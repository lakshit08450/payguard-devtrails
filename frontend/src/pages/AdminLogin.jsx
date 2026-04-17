import { useState } from 'react';
import { ChevronLeft, Lock, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../api';
import { useApp } from '../contexts/AppContext';
import AuthSplitLayout from '../components/AuthSplitLayout';

function errorMessage(err) {
  return err?.response?.data?.message || 'Unable to sign in as admin';
}

export default function AdminLogin({ onSuccess, onBack }) {
  const navigate = useNavigate();
  const { loginAdmin } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await adminAPI.login(username, password);
      loginAdmin(data.token, data.admin);
      if (onSuccess) onSuccess();
      else navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/', { replace: true });
  };

  return (
    <AuthSplitLayout title="Admin Control Center" subtitle="Role-based access for insurer operations">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <button type="button" className="btn-outline" onClick={handleBack} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ChevronLeft size={14} /> Back
        </button>

        <label style={{ color: 'var(--text2)', fontSize: 13 }}>Username</label>
        <div style={{ position: 'relative' }}>
          <User size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text3)' }} />
          <input
            className="input-field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter admin username"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <label style={{ color: 'var(--text2)', fontSize: 13 }}>Password</label>
        <div style={{ position: 'relative' }}>
          <Lock size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text3)' }} />
          <input
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            style={{ paddingLeft: 36 }}
          />
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}><Shield size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading || !username || !password} style={{ justifyContent: 'center' }}>
          {loading ? 'Authenticating...' : 'Login'}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
