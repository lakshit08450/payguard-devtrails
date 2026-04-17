import { useState } from 'react';
import { Shield, Sun, Moon, Globe, LogOut, Menu, X, Home, FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { LANGUAGES } from '../i18n';

export default function Navbar({ page, go }) {
  const { t, theme, toggleTheme, lang, changeLang, logout, user } = useApp();
  const [langOpen, setLangOpen] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);

  const links = [
    { key: 'home', label: t.nav_home, icon: <Home size={15} /> },
    { key: 'policy', label: t.nav_policy, icon: <FileText size={15} /> },
    { key: 'premium', label: t.nav_premium, icon: <TrendingUp size={15} /> },
    { key: 'claims', label: t.nav_claims, icon: <AlertCircle size={15} /> },
  ];

  return (
    <>
      <nav className="nav" style={{ padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <button onClick={() => go('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--teal), var(--teal2))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', letterSpacing: -0.5 }}>{t.brand}</span>
        </button>

        {/* Desktop nav links */}
        <div className="hide-mobile" style={{ display: 'flex', gap: 4 }}>
          {links.map(l => (
            <button key={l.key} onClick={() => go(l.key)} style={{
              background: page === l.key ? 'rgba(0,212,245,.1)' : 'none',
              border: 'none', color: page === l.key ? 'var(--teal)' : 'var(--text2)',
              borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
              fontSize: 13, fontWeight: page === l.key ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s'
            }}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Theme toggle */}
          <button onClick={toggleTheme} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)', transition: 'all .2s' }}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Language */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setLangOpen(!langOpen)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
              <Globe size={13} />
              {LANGUAGES.find(l => l.code === lang)?.flag} {LANGUAGES.find(l => l.code === lang)?.label}
            </button>
            {langOpen && (
              <div style={{ position: 'absolute', top: 40, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, minWidth: 150, zIndex: 300, boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .2s ease' }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => { changeLang(l.code); setLangOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: lang === l.code ? 'rgba(0,212,245,.1)' : 'none', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: lang === l.code ? 'var(--teal)' : 'var(--text)', fontSize: 13, fontWeight: lang === l.code ? 600 : 400 }}>
                    {l.flag} {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User avatar + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {(user?.name?.[0] || user?.phone?.[0] || '?').toUpperCase()}
            </div>
            <button onClick={logout} title={t.logout} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}>
              <LogOut size={15} />
            </button>
          </div>

          {/* Mobile menu */}
          <button className="show-mobile" onClick={() => setMobOpen(!mobOpen)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
            {mobOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobOpen && (
        <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map(l => (
            <button key={l.key} onClick={() => { go(l.key); setMobOpen(false); }} style={{ background: page === l.key ? 'rgba(0,212,245,.1)' : 'none', border: 'none', color: page === l.key ? 'var(--teal)' : 'var(--text2)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 14, fontWeight: page === l.key ? 600 : 400, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
      )}

      <style>{`.show-mobile { display: none; } @media(max-width:768px){ .show-mobile{display:flex!important} .hide-mobile{display:none!important} }`}</style>
      {langOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setLangOpen(false)} />}
    </>
  );
}
