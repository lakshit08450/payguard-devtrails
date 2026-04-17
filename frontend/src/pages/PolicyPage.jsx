import { useState, useEffect } from 'react';
import { Check, Loader, TrendingDown, RefreshCw, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { policyAPI, premiumAPI } from '../api';
import policyBannerImage from '../assets/policy-banner.png';
import premiumBannerImage from '../assets/premium-banner.png';
import claimsBannerImage from '../assets/claims-banner.png';
import zoneImage from '../assets/zone.png';
import successImage from '../assets/success-avatar.png';

/* ── shared ── */
function Pill({ color, bg, children }) {
  return <span style={{ background: bg || color + '22', color, border: `1px solid ${color}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

/* ══════════════════════════════════════════════════════════════
   POLICY PAGE
══════════════════════════════════════════════════════════════ */
export function PolicyPage({ go }) {
  const { t, user, setUser } = useApp();
  const navigate = useNavigate();

  const navigateWorker = (nextPage) => {
    if (typeof go === 'function') {
      go(nextPage);
      return;
    }
    const target = nextPage === 'home' ? '/worker/home' : `/worker/${nextPage}`;
    navigate(target);
    window.scrollTo(0, 0);
  };
  const [loading, setLoading] = useState(false);
  const policy = user?.policy;
  const planColors = { starter: '#06b6d4', pro: '#00d4f5', max: '#f59e0b' };
  const color = planColors[policy?.plan] || '#00d4f5';

  if (!policy?.plan) return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <Shield size={48} color="var(--text3)" style={{ marginBottom: 16 }} />
      <h2 style={{ fontSize: 22, marginBottom: 10 }}>{t.no_policy_msg}</h2>
      <button className="btn-primary" onClick={() => navigateWorker('home')}>{t.register_first}</button>
    </div>
  );

  const handleToggle = async () => {
    setLoading(true);
    try {
      const { data } = await policyAPI.toggle();
      setUser({ ...user, policy: { ...policy, status: data.status } });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const triggersList = ['🌧 Weather API', '📵 Platform Downtime', '✊ City Strike', '🚨 Accident', '🔒 Account Block'].slice(0, { starter: 3, pro: 5, max: 7 }[policy.plan]);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      {/* Hero banner */}
      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 20, height: 160 }}>
        <img src={policyBannerImage || '/fallback.png'} alt="policy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.45)' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
        <div style={{ position: 'absolute', inset: 0, padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>MY POLICY</div>
            <div style={{ fontWeight: 900, fontSize: 26, color: '#fff' }}>{t[policy.plan]}</div>
            <Pill color={policy.status === 'active' ? '#10b981' : '#f59e0b'}>{policy.status === 'active' ? t.policy_status_active : t.policy_status_paused}</Pill>
          </div>
          <button onClick={handleToggle} disabled={loading} className={policy.status === 'active' ? 'btn-outline' : 'btn-primary'} style={{ fontSize: 13, padding: '9px 16px' }}>
            {loading ? <Loader size={13} className="spin" /> : policy.status === 'active' ? t.pause : t.resume}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          [t.your_plan, t[policy.plan], color],
          [t.coverage, `₹${(policy.coverage || 0).toLocaleString('en-IN')}`, '#f59e0b'],
          [t.weekly_premium, `₹${policy.premium}/wk`, '#10b981'],
          [t.renews_on, policy.renewsAt ? new Date(policy.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', 'var(--text2)'],
        ].map(([label, val, c]) => (
          <div key={label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: c }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Triggers */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{t.active_triggers_label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {triggersList.map(tr => (
            <div key={tr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)', borderRadius: 10, padding: '11px 14px' }}>
              <span style={{ fontSize: 14 }}>{tr}</span>
              <Pill color="#10b981">Active</Pill>
            </div>
          ))}
        </div>
      </div>

      {/* Zone info */}
      {user?.zone?.area && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📍 Your Zone</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={zoneImage || '/fallback.png'} alt="zone" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{user.zone.area}, {user.zone.city}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>Risk Score: {user.zone.riskScore}/100</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📌 Policy Exclusions</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            'Extreme events such as war, floods, and major disasters are not covered.',
            'Fraudulent or false claims are rejected.',
            'GPS or location manipulation leads to denial.',
            'Platform rule violations are not eligible.',
            'Only defined triggers during active work are covered.',
          ].map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg2)', borderRadius: 10, padding: '11px 14px' }}>
              <span style={{ color: 'var(--red)', fontWeight: 900, lineHeight: 1 }}>•</span>
              <span style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PREMIUM PAGE
══════════════════════════════════════════════════════════════ */
export function PremiumPage() {
  const { t, user } = useApp();
  const [calc, setCalc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPremium, setAutoPremium] = useState(true);
  const [manualInput, setManualInput] = useState({
    basePremium: 59,
    rainfall: 20,
    riskLevel: 'MEDIUM',
    zoneRisk: 'MEDIUM',
    claimHistoryCount: 1,
    fraudScore: 35,
  });

  const refreshCalc = async () => {
    if (!loading) setRefreshing(true);
    try {
      const params = autoPremium
        ? { mode: 'auto' }
        : {
            mode: 'manual',
            ...manualInput,
          };

      const [{ data: premiumData }, { data: legacyData }] = await Promise.all([
        premiumAPI.calculate(params),
        policyAPI.premiumCalc(params),
      ]);

      const merged = {
        ...legacyData,
        final: premiumData?.finalPremium ?? legacyData?.final,
        riskLevel: premiumData?.riskLevel || legacyData?.riskLevel,
        breakdown: premiumData?.breakdown || legacyData?.breakdown || [],
        weather: premiumData?.weather || legacyData?.weather,
        config: premiumData?.config || legacyData?.config,
        mode: premiumData?.mode || params.mode,
      };

      setCalc(merged);

      if (loading) {
        setManualInput((prev) => ({
          ...prev,
          basePremium: Number(merged?.config?.basePremium || merged?.base || prev.basePremium),
          rainfall: Number(merged?.weather?.rainfall || prev.rainfall),
          claimHistoryCount: Number(merged?.claimHistoryCount || prev.claimHistoryCount),
          fraudScore: Number(merged?.fraudScore || prev.fraudScore),
          riskLevel: String(merged?.riskLevel || prev.riskLevel).toUpperCase(),
          zoneRisk: String(merged?.inputs?.zoneRisk || prev.zoneRisk).toUpperCase(),
        }));
      }
    } catch {
      // Keep previous data if refresh fails.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let stopped = false;
    refreshCalc();
    const timer = setInterval(() => {
      if (!stopped && autoPremium) refreshCalc();
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [autoPremium]);

  useEffect(() => {
    if (autoPremium || loading) return;
    const timer = setTimeout(() => {
      refreshCalc();
    }, 220);
    return () => clearTimeout(timer);
  }, [autoPremium, manualInput, loading]);

  const base = Number(calc?.base || { starter: 29, pro: 59, max: 99 }[user?.policy?.plan || 'pro']);
  const final = Number(calc?.final || base);
  const riskLevel = String(calc?.riskLevel || 'LOW').toUpperCase();
  const riskTone = riskLevel === 'HIGH' ? 'var(--red)' : riskLevel === 'MEDIUM' ? 'var(--gold)' : 'var(--green)';
  const riskBg = riskLevel === 'HIGH' ? 'rgba(239, 68, 68, 0.12)' : riskLevel === 'MEDIUM' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)';
  const factors = (calc?.breakdown?.length
    ? calc.breakdown
    : [
      { label: 'Zone Adjustment', value: Number(calc?.zoneAdj || 0) },
      { label: 'Weather Adjustment', value: Number(calc?.weatherAdj || 0) },
      { label: 'Platform Adjustment', value: Number(calc?.platformAdj || 0) },
      { label: 'Loyalty Adjustment', value: Number(calc?.loyaltyAdj || 0) },
    ])
    .filter((factor) => Number(factor?.value || 0) !== 0);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 24, height: 140 }}>
        <img src={premiumBannerImage || '/fallback.png'} alt="premium" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.4)' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
        <div style={{ position: 'absolute', inset: 0, padding: '24px 28px', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 22, marginBottom: 4 }}>{t.premium_calc_title}</h2>
            <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>{t.premium_calc_sub}</p>
          </div>
          <button className="btn-outline" onClick={refreshCalc} style={{ alignSelf: 'flex-start' }}>
            <RefreshCw size={15} /> {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Premium Mode</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{autoPremium ? 'Auto Premium ON' : 'Manual Premium OFF'}</div>
        </div>
        <button className={autoPremium ? 'btn-primary' : 'btn-outline'} onClick={() => setAutoPremium((prev) => !prev)}>
          {autoPremium ? 'Switch to Manual' : 'Switch to Auto'}
        </button>
      </div>

      {!autoPremium && (
        <div className="card" style={{ marginBottom: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, fontWeight: 600 }}>Manual Inputs</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label>
              Base Premium
              <input className="input-field" type="number" min={20} value={manualInput.basePremium} onChange={(e) => setManualInput((prev) => ({ ...prev, basePremium: Number(e.target.value || 59) }))} />
            </label>
            <label>
              Rainfall (mm)
              <input className="input-field" type="number" min={0} value={manualInput.rainfall} onChange={(e) => setManualInput((prev) => ({ ...prev, rainfall: Number(e.target.value || 0) }))} />
            </label>
            <label>
              Risk Level
              <select className="input-field" value={manualInput.riskLevel} onChange={(e) => setManualInput((prev) => ({ ...prev, riskLevel: e.target.value }))}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </label>
            <label>
              Zone Risk
              <select className="input-field" value={manualInput.zoneRisk} onChange={(e) => setManualInput((prev) => ({ ...prev, zoneRisk: e.target.value }))}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </label>
            <label>
              Claim History Count
              <input className="input-field" type="number" min={0} value={manualInput.claimHistoryCount} onChange={(e) => setManualInput((prev) => ({ ...prev, claimHistoryCount: Number(e.target.value || 0) }))} />
            </label>
            <label>
              Fraud Score
              <input className="input-field" type="number" min={0} max={100} value={manualInput.fraudScore} onChange={(e) => setManualInput((prev) => ({ ...prev, fraudScore: Number(e.target.value || 0) }))} />
            </label>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18, textAlign: 'center', padding: '32px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--teal), var(--purple))' }} />
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, letterSpacing: .5 }}>Real-time weekly premium</div>
        <div style={{ fontWeight: 900, fontSize: 64, color: final <= base ? 'var(--green)' : 'var(--gold)', lineHeight: 1 }}>
          ₹{final}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{t.per_week}</div>
        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 20, border: `1px solid ${riskTone}`, background: riskBg, color: riskTone, padding: '4px 10px', fontWeight: 700, fontSize: 12 }}>
          Risk: {riskLevel}
        </div>
        {Number(calc?.savings || 0) > 0 && (
          <div style={{ marginTop: 14, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 10, padding: '7px 16px', display: 'inline-flex', gap: 7, fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
            <TrendingDown size={14} /> Save ₹{calc.savings} vs plan base
          </div>
        )}
        {loading && <div style={{ marginTop: 10, color: 'var(--text3)', fontSize: 12 }}>Fetching live data...</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="card-sm">
          <span className="muted-label">Weather Source</span>
          <strong>{calc?.weather?.source || 'manual'}</strong>
          <p className="muted-copy" style={{ marginTop: 4 }}>{calc?.weather?.city || user?.zone?.city || 'Unknown'}</p>
        </div>
        <div className="card-sm">
          <span className="muted-label">Current Rainfall</span>
          <strong>{Number(calc?.weather?.rainfall || 0)} mm</strong>
          <p className="muted-copy" style={{ marginTop: 4 }}>{calc?.weather?.weatherDescription || 'no description'}</p>
        </div>
        <div className="card-sm">
          <span className="muted-label">Base Premium</span>
          <strong>₹{base}</strong>
          <p className="muted-copy" style={{ marginTop: 4 }}>Plan: {user?.policy?.plan || 'pro'}</p>
        </div>
        <div className="card-sm">
          <span className="muted-label">Risk Level</span>
          <strong style={{ color: riskTone }}>{riskLevel}</strong>
          <p className="muted-copy" style={{ marginTop: 4 }}>Risk score: {Number(calc?.riskScore || 0)}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '14px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>How this premium is calculated</div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{calc?.explanation || 'Premium adjusted based on rainfall risk and zone activity'}</div>
        <div className="muted-copy" style={{ marginTop: 6 }}>
          Global config: Base ₹{Number(calc?.config?.basePremium || base)} | Multiplier x{Number(calc?.config?.riskMultiplier || 1)} | Fraud sensitivity {String(calc?.config?.fraudSensitivity || 'medium')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {factors.map((factor) => (
          <div key={factor.label} className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>{factor.label}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{Number(factor.value) >= 0 ? 'Increases premium' : 'Reduces premium'}</div>
            </div>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: Number(factor.value) < 0 ? 'var(--green)' : 'var(--red)' }}>
              {Number(factor.value) >= 0 ? '+' : '-'}₹{Math.abs(Number(factor.value))}
            </span>
          </div>
        ))}
        {!factors.length && (
          <div className="card" style={{ padding: '12px 16px', color: 'var(--text3)' }}>
            No adjustments yet. Premium is currently at base value.
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CLAIMS PAGE
══════════════════════════════════════════════════════════════ */
const PAST = [
  { date: '28 Mar', reason: 'Platform Downtime', amount: 312, status: 'paid' },
  { date: '21 Mar', reason: 'Heavy Rain',         amount: 185, status: 'paid' },
  { date: '14 Mar', reason: 'City Strike',        amount: 420, status: 'pending' },
];

const TRIGGERS = [
  { key: 'weather',  label: '🌧 Heavy Rain Alert',    color: '#06b6d4' },
  { key: 'platform', label: '📵 Platform Downtime',   color: '#f59e0b' },
  { key: 'strike',   label: '✊ City Strike',         color: '#f97316' },
  { key: 'accident', label: '🚨 Accident Detected',   color: '#ef4444' },
  { key: 'block',    label: '🔒 Account Block',       color: '#8b5cf6' },
];

export function ClaimsPage() {
  const { t, user } = useApp();
  const [claimState, setClaimState] = useState('idle');
  const [claimStep, setClaimStep] = useState(0);
  const [claimAmt, setClaimAmt] = useState(0);
  const [activeTrigger, setActiveTrigger] = useState(null);

  const fire = async (trigger) => {
    setActiveTrigger(trigger);
    setClaimState('running');
    setClaimStep(0);
    const amt = Math.floor(150 + Math.random() * 300);
    setClaimAmt(amt);

    // Simulate step progression
    const steps = [0, 1, 2, 3, 4];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 1200));
      setClaimStep(i);
    }
    await new Promise(r => setTimeout(r, 600));
    setClaimState('done');

    // Also call API
    try { await policyAPI.claim(trigger.key); } catch { /* fine */ }
  };

  const stepLabels = ['Trigger Detected', 'AI Validation', 'Amount Calculated', 'UPI Transfer', 'Done ✓'];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      {/* Header */}
      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 24, height: 140 }}>
        <img src={claimsBannerImage || '/fallback.png'} alt="claims" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.4)' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
        <div style={{ position: 'absolute', inset: 0, padding: '24px 28px' }}>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 22, marginBottom: 4 }}>{t.claims_title}</h2>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>{t.claims_sub}</p>
        </div>
      </div>

      {/* Idle - trigger list */}
      {claimState === 'idle' && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, letterSpacing: .5 }}>{t.live_triggers}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {TRIGGERS.map(tr => (
              <div key={tr.key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: tr.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{tr.label}</span>
                </div>
                <button className="btn-outline" onClick={() => fire(tr)} style={{ padding: '7px 14px', fontSize: 12 }}>{t.file_claim}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Running */}
      {claimState === 'running' && (
        <div className="card fu" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{t.claim_processing}</div>
          <div style={{ fontSize: 13, color: activeTrigger?.color, marginBottom: 24, fontWeight: 600 }}>{activeTrigger?.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stepLabels.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: i < claimStep ? 'rgba(16,185,129,.15)' : i === claimStep ? 'rgba(0,212,245,.15)' : 'var(--bg2)', border: `2px solid ${i < claimStep ? 'var(--green)' : i === claimStep ? 'var(--teal)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .3s' }}>
                  {i < claimStep ? <Check size={14} color="var(--green)" /> : i === claimStep ? <Loader size={14} color="var(--teal)" className="spin" /> : <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>{i + 1}</span>}
                </div>
                <span style={{ fontSize: 14, color: i <= claimStep ? 'var(--text)' : 'var(--text3)', fontWeight: i === claimStep ? 700 : 400, transition: 'all .3s' }}>{s}</span>
                {i === claimStep && <div className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done */}
      {claimState === 'done' && (
        <div className="card fu" style={{ marginBottom: 20, textAlign: 'center', padding: '40px 24px' }}>
          <img src={successImage || '/fallback.png'} alt="claim success" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', border: '3px solid var(--green)' }} onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
          <CheckCircle size={36} color="var(--green)" style={{ marginBottom: 12 }} />
          <div style={{ fontWeight: 900, fontSize: 36, color: 'var(--green)', marginBottom: 6 }}>₹{claimAmt} {t.claim_done}</div>
          <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>Transferred to your bank in under 15 minutes</div>
          <button className="btn-outline" onClick={() => setClaimState('idle')}>← Back</button>
        </div>
      )}

      {/* Past claims */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{t.past_claims}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PAST.map(c => (
            <div key={c.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)', borderRadius: 12, padding: '12px 14px' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.reason}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: c.status === 'paid' ? 'var(--green)' : 'var(--gold)' }}>₹{c.amount}</div>
                <Pill color={c.status === 'paid' ? '#10b981' : '#f59e0b'}>{c.status === 'paid' ? t.paid : t.processing}</Pill>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
