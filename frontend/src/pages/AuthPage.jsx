import { Globe, LayoutDashboard, Moon, Shield, Smartphone, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { LANGUAGES } from '../i18n';
import { useState } from 'react';
import AuthSplitLayout from '../components/AuthSplitLayout';

export default function AuthPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme, lang, changeLang } = useApp();
  const [langOpen, setLangOpen] = useState(false);

  return (
    <AuthSplitLayout
      title="PayGuard Access"
      subtitle="Choose your portal"
      topRight={(
        <>
          <button onClick={toggleTheme} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)' }}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setLangOpen(!langOpen)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
              <Globe size={13} />{LANGUAGES.find((l) => l.code === lang)?.flag}
            </button>
            {langOpen && (
              <div style={{ position: 'absolute', top: 40, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, minWidth: 150, zIndex: 300, boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .2s ease' }}>
                {LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => { changeLang(l.code); setLangOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: lang === l.code ? 'rgba(0,212,245,.1)' : 'none', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: lang === l.code ? 'var(--teal)' : 'var(--text)', fontSize: 13, fontWeight: lang === l.code ? 600 : 400 }}>
                    {l.flag} {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    >
      <p style={{ margin: 0, color: 'var(--text2)', marginBottom: 18 }}>Worker App and Admin System are fully separated.</p>

      <div style={{ display: 'grid', gap: 12 }}>
        <button
          type="button"
          className="auth-entry-card"
          style={{ border: '1px solid rgba(0,212,245,0.35)', borderRadius: 14, background: 'rgba(0,212,245,0.06)', padding: 16, display: 'flex', gap: 12, textAlign: 'left', cursor: 'pointer' }}
          onClick={() => navigate('/worker')}
        >
          <div className="auth-entry-icon auth-entry-icon-worker"><Smartphone size={18} /></div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Worker App</strong>
            <p style={{ margin: 0, marginTop: 4, color: 'var(--text3)', fontSize: 13 }}>OTP login, policy, premium, and claims flow</p>
          </div>
        </button>

        <button
          type="button"
          className="auth-entry-card"
          style={{ border: '1px solid rgba(14,165,233,0.35)', borderRadius: 14, background: 'rgba(14,165,233,0.08)', padding: 16, display: 'flex', gap: 12, textAlign: 'left', cursor: 'pointer' }}
          onClick={() => navigate('/admin/login')}
        >
          <div className="auth-entry-icon auth-entry-icon-admin"><LayoutDashboard size={18} /></div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Admin Portal</strong>
            <p style={{ margin: 0, marginTop: 4, color: 'var(--text3)', fontSize: 13 }}>Control center, analytics, and system controls</p>
          </div>
        </button>
      </div>

      {langOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setLangOpen(false)} />}
    </AuthSplitLayout>
  );
}
