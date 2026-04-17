import { Shield } from 'lucide-react';
import { useState } from 'react';
import authImage from '../assets/auth.png';

export default function AuthSplitLayout({
  title,
  subtitle,
  kicker = 'PayGuard',
  children,
  topRight,
}) {
  const [illustration, setIllustration] = useState(authImage);

  return (
    <div className="auth-shell">
      {topRight && <div className="auth-shell-top-right">{topRight}</div>}

      <div className="card auth-split-shell">
        <div className="auth-split-grid">
          <div className="auth-split-image">
            <img
              src={illustration || '/fallback.png'}
              alt="login"
              className="auth-split-image-media"
              onError={() => {
                if (illustration !== '/fallback.png') setIllustration('/fallback.png');
              }}
            />
            <div className="auth-split-image-overlay" />
            <div className="auth-split-image-copy">
              <p>{kicker}</p>
              <h3>Secure insurance experiences for workers and administrators.</h3>
            </div>
          </div>

          <div className="auth-split-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)', display: 'grid', placeItems: 'center' }}>
                <Shield size={18} color="#fff" />
              </div>
              <div>
                <h2 style={{ margin: 0, color: 'var(--text)' }}>{title}</h2>
                <small style={{ color: 'var(--text3)' }}>{subtitle}</small>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
