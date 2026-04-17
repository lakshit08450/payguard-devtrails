import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, RefreshCw, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import { useApp } from '../contexts/AppContext';
import AuthSplitLayout from '../components/AuthSplitLayout';

function getApiErrorMessage(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === 'ERR_NETWORK') {
    return 'Cannot reach the PayGuard API at http://localhost:5000. Start backend and try again.';
  }
  return fallback;
}

export default function WorkerAuthPage() {
  const navigate = useNavigate();
  const { login, t } = useApp();
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const resetForm = () => {
    setStep('phone');
    setOtp('');
    setName('');
    setError('');
    setSuccess('');
  };

  const handleSendOtp = async () => {
    setError('');
    setSuccess('');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }

    setLoading(true);
    try {
      await authAPI.sendOTP(phone, mode);
      setStep('otp');
      setCountdown(30);
      setSuccess(`OTP sent to +91 ${phone}`);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setSuccess('');
    if (otp.length < 6) {
      setError('Enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.verifyOTP(phone, otp, mode, name);
      login(res.data.token, res.data.user);
      navigate('/worker/home', { replace: true });
    } catch (e) {
      setError(getApiErrorMessage(e, 'Invalid OTP'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout title="Worker Access" subtitle="OTP authentication for worker app">
      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}
        >
          <ChevronLeft size={16} /> Back to role selection
        </button>
      </div>

      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 12, padding: 4, marginBottom: 20, border: '1px solid var(--border)' }}>
          {['login', 'register'].map((currentMode) => (
            <button
              key={currentMode}
              onClick={() => {
                setMode(currentMode);
                resetForm();
              }}
              style={{
                flex: 1,
                background: mode === currentMode ? 'var(--card)' : 'none',
                border: 'none',
                borderRadius: 9,
                padding: '9px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: mode === currentMode ? 700 : 400,
                color: mode === currentMode ? 'var(--teal)' : 'var(--text2)',
              }}
            >
              {currentMode === 'login' ? t.login : t.register}
            </button>
          ))}
      </div>

      {step === 'phone' && (
        <div style={{ display: 'grid', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label>{t.your_name}</label>
                <input
                  className="input-field"
                  placeholder={t.name_placeholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label>{t.enter_phone}</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)', fontSize: 14, fontWeight: 600 }}>🇮🇳 +91</span>
                <input
                  className="input-field"
                  type="tel"
                  maxLength={10}
                  placeholder={t.phone_placeholder}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  style={{ paddingLeft: 72 }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                />
              </div>
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>}
            <button className="btn-primary" onClick={handleSendOtp} disabled={loading || phone.length < 10} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
              {loading ? 'Sending...' : <><Smartphone size={16} />{t.send_otp}</>}
            </button>
        </div>
      )}

      {step === 'otp' && (
        <div style={{ display: 'grid', gap: 14 }}>
            <button onClick={() => { setStep('phone'); setOtp(''); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <ChevronLeft size={16} /> Back to phone
            </button>
            {success && <div style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--green)' }}>✓ {success}</div>}
            <div>
              <label>{t.enter_otp}</label>
              <input
                className="input-field"
                type="tel"
                maxLength={6}
                placeholder="• • • • • •"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                style={{ letterSpacing: 10, fontSize: 22, textAlign: 'center' }}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
              />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>}
            <button className="btn-primary" onClick={handleVerifyOtp} disabled={loading || otp.length < 6} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
              {loading ? 'Verifying...' : <>{t.verify} <ArrowRight size={16} /></>}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>{t.resend_in} {countdown}s</span>
              ) : (
                <button onClick={handleSendOtp} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                  <RefreshCw size={13} />{t.resend_otp}
                </button>
              )}
            </div>
        </div>
      )}
    </AuthSplitLayout>
  );
}
