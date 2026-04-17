import { useState } from 'react';
import { Shield, Check, ChevronRight, Loader, MapPin, FileText, Smartphone, Star } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { authAPI, kycAPI, policyAPI } from '../api';
import kycImage from '../assets/kyc.png';
import platformImage from '../assets/platform.png';
import mapImage from '../assets/map.png';

const STEPS = ['step_phone', 'step_kyc', 'step_platform', 'step_zone', 'step_plan'];
const PLANS = [
  { key: 'starter', price: 29, coverage: 2000, triggers: 3, color: '#06b6d4', features: ['Weather trigger', 'Platform downtime', 'WhatsApp alerts'] },
  { key: 'pro',     price: 59, coverage: 5000, triggers: 5, color: '#00d4f5', features: ['All Starter +', 'City strike', 'Accident cover', 'Priority support'], popular: true },
  { key: 'max',     price: 99, coverage: 10000, triggers: 7, color: '#f59e0b', features: ['All Pro +', 'Account block', 'Festival surge', 'Dedicated manager'] },
];
const PLATFORMS = [
  { key: 'swiggy',  label: 'Swiggy',   color: '#FF6B35', img: platformImage },
  { key: 'zomato',  label: 'Zomato',   color: '#E53935', img: platformImage },
  { key: 'blinkit', label: 'Blinkit',  color: '#FFCA28', img: platformImage },
  { key: 'zepto',   label: 'Zepto',    color: '#7C3AED', img: platformImage },
  { key: 'dunzo',   label: 'Dunzo',    color: '#10b981', img: platformImage },
];

function StepDot({ done, active, n }) {
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: done ? 'var(--green)' : active ? 'var(--teal)' : 'var(--bg3)', border: `2px solid ${done ? 'var(--green)' : active ? 'var(--teal)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .35s', fontSize: 12, fontWeight: 700, color: done || active ? '#fff' : 'var(--text3)' }}>
      {done ? <Check size={14} /> : n}
    </div>
  );
}

export default function RegisterFlow() {
  const { t, setUser } = useApp();
  const [step, setStep] = useState(1); // 1-5
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // KYC state
  const [aadhaar, setAadhaar] = useState('');
  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const [txnId, setTxnId] = useState('');
  const [aadhaarStep, setAadhaarStep] = useState('input'); // input | otp | done
  const [sandboxMode, setSandboxMode] = useState(false);

  // Platform & zone
  const [linked, setLinked] = useState([]);
  const [zone, setZone] = useState(null);

  // Plan
  const [plan, setPlan] = useState('pro');

  const sim = (fn, ms = 1200) => { setLoading(true); return new Promise(r => setTimeout(() => { setLoading(false); fn(); r(); }, ms)); };

  const handleAadhaarOtp = async () => {
    if (!/^\d{12}$/.test(aadhaar)) return setErr('Enter a valid 12-digit Aadhaar number');
    setErr(''); setLoading(true);
    try {
      const { data } = await kycAPI.sendAadhaarOTP(aadhaar);
      setTxnId(data.txnId);
      setSandboxMode(!!data.sandboxMode);
      setAadhaarStep('otp');
    } catch (e) { setErr(e.response?.data?.message || 'Failed to send OTP'); }
    finally { setLoading(false); }
  };

  const handleAadhaarVerify = async () => {
    if (!aadhaarOtp) return setErr('Enter the OTP');
    setErr(''); setLoading(true);
    try {
      const { data } = await kycAPI.verifyAadhaar(txnId, aadhaarOtp, aadhaar.slice(-4));
      if (data.success) { setAadhaarStep('done'); setTimeout(() => setStep(3), 800); }
    } catch (e) { setErr(e.response?.data?.message || 'Verification failed'); }
    finally { setLoading(false); }
  };

  const linkPlatform = async (key) => {
    if (linked.includes(key)) return;
    setLoading(true);
    try {
      const { data } = await kycAPI.linkPlatform(key);
      setLinked(data.linked);
    } catch { setLinked(p => [...p, key]); } // optimistic
    finally { setLoading(false); }
  };

  const handleZone = async () => {
    setErr(''); setLoading(true);
    try {
      navigator.geolocation?.getCurrentPosition(
        async ({ coords }) => {
          const { data } = await kycAPI.zoneScan(coords.latitude, coords.longitude);
          setZone(data.zone); setLoading(false);
        },
        async () => {
          const { data } = await kycAPI.zoneScan(null, null);
          setZone(data.zone); setLoading(false);
        }
      );
    } catch { setLoading(false); }
  };

  const handleActivate = async () => {
    setErr(''); setLoading(true);
    try {
      await policyAPI.activate(plan);
      const me = await authAPI.me();
      setUser(me.data.user);
    } catch (e) { setErr(e.response?.data?.message || 'Activation failed'); setLoading(false); }
  };

  const stepLabels = [t.step_phone, t.step_kyc, t.step_platform, t.step_zone, t.step_plan];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--teal), var(--teal2))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={18} color="#fff" />
        </div>
        <span style={{ fontWeight: 800, fontSize: 18 }}>PayGuard</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text3)' }}>Step {step} of 5</span>
      </div>

      {/* Step indicator */}
      <div style={{ padding: '20px 24px 0', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          {stepLabels.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < stepLabels.length - 1 ? '1' : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <StepDot done={step > i + 1} active={step === i + 1} n={i + 1} />
                <span style={{ fontSize: 9, color: step >= i + 1 ? 'var(--text)' : 'var(--text3)', fontWeight: step === i + 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className={`step-line${step > i + 1 ? ' done' : ''}`} style={{ margin: '0 4px', marginBottom: 14 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '0 24px 40px', maxWidth: 600, margin: '0 auto', width: '100%' }}>

        {/* ── STEP 1 — Phone already done (they just logged in with OTP) ── */}
        {step === 1 && (
          <div className="fu">
            <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,.1), rgba(0,212,245,.1))', border: '1px solid rgba(16,185,129,.3)', borderRadius: 16, padding: 24, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16,185,129,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={24} color="var(--green)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>Phone Verified ✓</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Your mobile number has been confirmed via OTP</div>
              </div>
            </div>
            <button className="btn-primary" onClick={() => setStep(2)} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
              Continue to KYC <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── STEP 2 — KYC ── */}
        {step === 2 && (
          <div className="fu">
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <img src={kycImage || '/fallback.png'} alt="KYC" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{t.kyc_title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{t.kyc_sub}</p>
              </div>
            </div>

            {aadhaarStep === 'done' ? (
              <div style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 16 }}>{t.kyc_verified}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>Aadhaar XXXX XXXX {aadhaar.slice(-4)} verified</div>
              </div>
            ) : aadhaarStep === 'input' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label>{t.aadhaar_number}</label>
                  <input className="input-field" type="tel" maxLength={12} placeholder={t.aadhaar_placeholder} value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g, ''))} />
                </div>
                {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {err}</p>}
                <button className="btn-primary" onClick={handleAadhaarOtp} disabled={loading || aadhaar.length < 12} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                  {loading ? <><Loader size={16} className="spin" />Sending...</> : <><FileText size={16} />{t.send_aadhaar_otp}</>}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {sandboxMode && (
                  <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--gold)' }}>{t.sandbox_hint}</div>
                )}
                <div>
                  <label>{t.aadhaar_otp}</label>
                  <input className="input-field" type="tel" maxLength={6} placeholder={t.aadhaar_otp_placeholder} value={aadhaarOtp} onChange={e => setAadhaarOtp(e.target.value.replace(/\D/g, ''))} style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20 }} autoFocus />
                </div>
                {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {err}</p>}
                <button className="btn-primary" onClick={handleAadhaarVerify} disabled={loading || aadhaarOtp.length < 6} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                  {loading ? <><Loader size={16} className="spin" />Verifying...</> : <><Check size={16} />{t.verify_aadhaar}</>}
                </button>
                <button onClick={() => { setAadhaarStep('input'); setErr(''); }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, textAlign: 'center' }}>← Change Aadhaar number</button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 — Platform ── */}
        {step === 3 && (
          <div className="fu">
            <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{t.platform_title}</h3>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>{t.platform_sub}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {PLATFORMS.map(p => (
                <button key={p.key} onClick={() => linkPlatform(p.key)} disabled={loading && !linked.includes(p.key)} style={{ background: linked.includes(p.key) ? `${p.color}18` : 'var(--card)', border: `1.5px solid ${linked.includes(p.key) ? p.color + '88' : 'var(--border)'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all .2s', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={p.img || '/fallback.png'} alt={p.label} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', filter: 'saturate(1.3)' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
                    <span style={{ fontWeight: 600, fontSize: 15, color: linked.includes(p.key) ? p.color : 'var(--text)' }}>{p.label}</span>
                  </div>
                  {linked.includes(p.key) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontWeight: 600, fontSize: 13 }}>
                      <Check size={16} /> {t.linked}
                    </div>
                  ) : (
                    <div style={{ color: p.color, fontWeight: 600, fontSize: 13 }}>{t.link} →</div>
                  )}
                </button>
              ))}
            </div>
            {linked.length > 0 && (
              <button className="btn-primary" onClick={() => setStep(4)} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                {t.continue} <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}

        {/* ── STEP 4 — Zone ── */}
        {step === 4 && (
          <div className="fu">
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: 20, height: 160 }}>
              <img src={mapImage || '/fallback.png'} alt="Map" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)' }} />
              <div style={{ position: 'absolute', bottom: 14, left: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{t.zone_title}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t.zone_sub}</div>
              </div>
            </div>

            {!zone ? (
              <button className="btn-primary" onClick={handleZone} disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                {loading ? <><Loader size={16} className="spin" />{t.scanning}</> : <><MapPin size={16} />{t.scan_zone}</>}
              </button>
            ) : (
              <div className="fu">
                <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 12, fontSize: 15 }}>✓ {t.zone_result}</div>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{zone.area}, {zone.city}</div>
                  {[
                    [t.flood_risk, zone.flood, zone.flood === 'Low' ? 'var(--green)' : zone.flood === 'Medium' ? 'var(--gold)' : 'var(--red)'],
                    [t.traffic, zone.traffic, zone.traffic === 'Low' ? 'var(--green)' : 'var(--gold)'],
                    [t.historical_claims, `${zone.riskScore < 20 ? 'Low' : zone.riskScore < 30 ? 'Medium' : 'High'} (${zone.riskScore}/100)`, zone.riskScore < 20 ? 'var(--green)' : 'var(--gold)'],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 8 }}>
                      <span style={{ color: 'var(--text2)' }}>{label}</span>
                      <span style={{ fontWeight: 600, color }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'rgba(0,212,245,.08)', border: '1px solid rgba(0,212,245,.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--teal)', marginBottom: 16 }}>
                  💡 {zone.riskScore < 20 ? 'Great news! Safe zone = lower premium 🎉' : 'Zone risk factored into your premium'}
                </div>
                <button className="btn-primary" onClick={() => setStep(5)} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                  {t.continue} <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5 — Plan ── */}
        {step === 5 && (
          <div className="fu">
            <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{t.plan_title}</h3>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>{t.plan_sub}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {PLANS.map(p => (
                <button key={p.key} onClick={() => setPlan(p.key)} style={{ background: plan === p.key ? `${p.color}12` : 'var(--card)', border: `2px solid ${plan === p.key ? p.color : 'var(--border)'}`, borderRadius: 16, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', position: 'relative', transition: 'all .2s' }}>
                  {p.popular && <div style={{ position: 'absolute', top: -10, right: 14, background: 'var(--teal)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>POPULAR</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: plan === p.key ? p.color : 'var(--text)', marginBottom: 4 }}>{t[p.key]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {p.features.map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                            <Check size={11} color="var(--green)" />{f}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 900, fontSize: 26, color: p.color }}>₹{p.price}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.per_week}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>₹{p.coverage.toLocaleString('en-IN')} {t.coverage}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>⚠ {err}</p>}
            <button className="btn-gold" onClick={handleActivate} disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: 16, fontSize: 16 }}>
              {loading ? <><Loader size={16} className="spin" />{t.activating}</> : <><Shield size={16} />{t.activate}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
