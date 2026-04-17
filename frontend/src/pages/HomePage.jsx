import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BadgeIndianRupee, FileClock, LocateFixed, Radar, ShieldCheck, Siren, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { kycAPI, monitorAPI, policyAPI, simulateAPI } from '../api';
import { useApp } from '../contexts/AppContext';
import workerHeroImage from '../assets/worker-hero.png';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatCoord(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(6);
}

function StatusPill({ children, tone = 'info' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function createFallbackWorkerData(user) {
  const coverageAmount = user?.policy?.coverage || 1000;
  const premiumPaid = user?.policy?.premium || 20;
  const startDate = user?.policy?.activatedAt ? new Date(user.policy.activatedAt).toLocaleDateString('en-IN') : 'Today';
  const expiryDate = user?.policy?.renewsAt ? new Date(user.policy.renewsAt).toLocaleString('en-IN', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'Sunday 11:59 PM';

  return {
    coverage: {
      policyId: `PG${String(user?.id || '1021').slice(-4).toUpperCase()}`,
      coverageAmount,
      premiumPaid,
      startDate,
      expiryDate,
      status: user?.policy?.status === 'active' ? 'Active' : 'Expired',
    },
    protection: {
      totalEarningsProtected: 3200,
      weeklyCoverageLimit: Math.max(1000, Math.round(coverageAmount / 5)),
    },
    fraud: {
      riskScore: 5,
      status: 'Safe',
    },
    claims: [
      { claimId: 'CLM-1204', eventType: 'Rain', status: 'Approved', amount: 240, date: '12 Apr 2026' },
      { claimId: 'CLM-1198', eventType: 'Flood', status: 'Pending', amount: 320, date: '09 Apr 2026' },
      { claimId: 'CLM-1188', eventType: 'Platform outage', status: 'Rejected', amount: 180, date: '04 Apr 2026' },
    ],
    payouts: [
      { transactionId: 'TXN-44021', amount: 240, date: '12 Apr 2026', paymentMethod: 'UPI', status: 'Settled' },
      { transactionId: 'TXN-43970', amount: 180, date: '04 Apr 2026', paymentMethod: 'Bank Transfer', status: 'Settled' },
    ],
  };
}

export default function HomePage({ go }) {
  const { user } = useApp();
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
  const [dashboard, setDashboard] = useState(() => createFallbackWorkerData(user));
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState({ isMonitoring: false, users: [] });
  const [latestAutoEvent, setLatestAutoEvent] = useState(null);
  const [autoPulse, setAutoPulse] = useState(false);
  const [gps, setGps] = useState({
    enabled: false,
    status: 'Unavailable',
    lat: null,
    lng: null,
    accuracy: null,
    speed: null,
    heading: null,
    lastGpsAt: null,
    error: '',
  });
  const lastGpsSyncRef = useRef(0);
  const userId = user?.id;

  useEffect(() => {
    let ignore = false;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const { data } = await policyAPI.dashboard();
        if (!ignore) setDashboard(data);
      } catch {
        if (!ignore) setDashboard(createFallbackWorkerData(user));
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadDashboard();
    return () => { ignore = true; };
  }, [user]);

  useEffect(() => {
    if (!userId) return;

    const refreshAutoSnapshot = async () => {
      const [monitorRes, timelineRes] = await Promise.all([
        monitorAPI.status(),
        simulateAPI.detailedTimeline(userId),
      ]);

      setMonitoring(monitorRes.data.monitoring || { isMonitoring: false, users: [] });

      const entries = timelineRes.data.entries || [];
      const latestAuto = entries.find((entry) => entry?.event?.meta?.autoMonitored);
      setLatestAutoEvent((previous) => {
        if (!latestAuto) return previous;
        const prevTs = new Date(previous?.timestamp || 0).getTime();
        const nextTs = new Date(latestAuto.timestamp || 0).getTime();
        if (nextTs > prevTs) {
          setAutoPulse(true);
          setTimeout(() => setAutoPulse(false), 1200);
          return latestAuto;
        }
        return previous || latestAuto;
      });
    };

    refreshAutoSnapshot().catch(() => {});

    const pollTimer = setInterval(() => {
      refreshAutoSnapshot().catch(() => {});
    }, 4000);

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const streamBase = apiBase.replace(/\/?$/, '');
    const stream = new EventSource(`${streamBase}/monitor/stream?userId=${encodeURIComponent(userId)}`);
    stream.addEventListener('monitor-event', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        setLatestAutoEvent(payload);
        setAutoPulse(true);
        setTimeout(() => setAutoPulse(false), 1200);
      } catch {
        // Ignore malformed monitor events.
      }
    });

    return () => {
      clearInterval(pollTimer);
      stream.close();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let watchId = null;

    const loadSavedGps = async () => {
      try {
        const { data } = await kycAPI.location();
        const location = data?.location;
        if (location?.lat != null && location?.lng != null) {
          setGps((prev) => ({
            ...prev,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            speed: location.speed,
            heading: location.heading,
            lastGpsAt: location.lastGpsAt,
            status: 'Last known location',
          }));
        }
      } catch {
        // Ignore warm-up failures.
      }
    };

    const pushGps = async (position) => {
      const payload = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
      };

      const now = Date.now();
      if (now - lastGpsSyncRef.current < 12000) return;
      lastGpsSyncRef.current = now;

      try {
        await kycAPI.locationUpdate(payload);
      } catch {
        // Keep UI live even if backend write fails intermittently.
      }
    };

    const onPosition = (position) => {
      setGps({
        enabled: true,
        status: 'Live',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        lastGpsAt: new Date(position.timestamp).toISOString(),
        error: '',
      });
      pushGps(position);
    };

    const onGpsError = (error) => {
      const message = error?.message || 'Location permission denied or unavailable';
      setGps((prev) => ({
        ...prev,
        enabled: false,
        status: 'Unavailable',
        error: message,
      }));
    };

    loadSavedGps();

    if (!navigator.geolocation) {
      setGps((prev) => ({
        ...prev,
        enabled: false,
        status: 'Unsupported',
        error: 'Geolocation is not supported by this browser',
      }));
      return () => {};
    }

    watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [userId]);

  const summaryCards = useMemo(() => [
    { label: 'Coverage Amount', value: formatCurrency(dashboard.coverage.coverageAmount), icon: <ShieldCheck size={18} />, accent: '#00d4f5' },
    { label: 'Premium Paid', value: formatCurrency(dashboard.coverage.premiumPaid), icon: <Wallet size={18} />, accent: '#10b981' },
    { label: 'Total Earnings Protected', value: formatCurrency(dashboard.protection.totalEarningsProtected), icon: <BadgeIndianRupee size={18} />, accent: '#f59e0b' },
    { label: 'Weekly Limit', value: formatCurrency(dashboard.protection.weeklyCoverageLimit), icon: <FileClock size={18} />, accent: '#8b5cf6' },
  ], [dashboard]);

  const monitorInfo = monitoring.users?.find((entry) => String(entry.userId) === String(userId));

  return (
    <div className="worker-dashboard">
      <section className="worker-hero">
        <img src={workerHeroImage || '/fallback.png'} alt="Delivery worker" onError={(e) => { e.currentTarget.src = '/fallback.png'; }} />
        <div className="worker-hero-overlay" />
        <div className="worker-hero-copy">
          <div>
            <div className="worker-kicker">Worker Dashboard</div>
            <h1>Income protection that reacts to real-world disruptions before they hit your weekly earnings.</h1>
            <p>Track coverage health, review claims, confirm payouts, and keep an eye on fraud safety in one operational view.</p>
          </div>
          <div className="worker-hero-actions">
            <button className="btn-primary" onClick={() => navigateWorker('claims')}>
              <Siren size={16} />
              File Claim
            </button>
            <button className="btn-outline" onClick={() => navigateWorker('policy')}>View Policy</button>
          </div>
        </div>
      </section>

      <section className="worker-summary-grid">
        {summaryCards.map(card => (
          <div key={card.label} className="worker-summary-card" style={{ '--summary-accent': card.accent }}>
            <div className="worker-summary-icon">{card.icon}</div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </section>

      <section className={`card worker-panel auto-feed-card ${autoPulse ? 'auto-feed-card-pulse' : ''}`}>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <h3>Auto Monitoring Activity</h3>
            <p>Zero-touch feed showing automated disruption checks and claim triggers.</p>
          </div>
          <span className={`pill ${monitoring.isMonitoring ? 'pill-safe' : 'pill-warn'}`}>
            Auto Monitoring: {monitoring.isMonitoring ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="auto-feed-grid">
          <div className="auto-feed-item">
            <span>Last Checked</span>
            <strong>{monitorInfo?.lastCheckedAt ? new Date(monitorInfo.lastCheckedAt).toLocaleTimeString('en-IN') : '--:--'}</strong>
          </div>
          <div className="auto-feed-item">
            <span>Last Trigger</span>
            <strong>{monitorInfo?.lastTriggeredAt ? new Date(monitorInfo.lastTriggeredAt).toLocaleTimeString('en-IN') : 'None yet'}</strong>
          </div>
          <div className="auto-feed-item">
            <span>Rainfall</span>
            <strong>{monitorInfo?.lastObservedRainfall ?? 0} mm</strong>
          </div>
          <div className="auto-feed-item">
            <span>Latest Event</span>
            <strong>{latestAutoEvent?.event?.type || 'Awaiting auto event'}</strong>
          </div>
        </div>
        <div className="auto-feed-banner">
          <Radar size={15} />
          {latestAutoEvent
            ? `Auto Claim Triggered (${latestAutoEvent.event?.type || 'WEATHER'} - ${latestAutoEvent.event?.meta?.weatherDescription || 'rain condition'})`
            : 'Waiting for auto-triggered activity...'}
        </div>
      </section>

      <section className="card worker-panel gps-card">
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <h3>Real-Time GPS</h3>
            <p>Live location from device GPS to support auto-zone and claim verification.</p>
          </div>
          <span className={`pill ${gps.status === 'Live' ? 'pill-safe' : 'pill-warn'}`}>
            <LocateFixed size={13} style={{ marginRight: 6 }} /> {gps.status}
          </span>
        </div>
        <div className="auto-feed-grid">
          <div className="auto-feed-item">
            <span>Latitude</span>
            <strong>{formatCoord(gps.lat)}</strong>
          </div>
          <div className="auto-feed-item">
            <span>Longitude</span>
            <strong>{formatCoord(gps.lng)}</strong>
          </div>
          <div className="auto-feed-item">
            <span>Accuracy</span>
            <strong>{gps.accuracy ? `${Math.round(gps.accuracy)} m` : '--'}</strong>
          </div>
          <div className="auto-feed-item">
            <span>Speed</span>
            <strong>{gps.speed != null ? `${(Number(gps.speed) * 3.6).toFixed(1)} km/h` : '--'}</strong>
          </div>
        </div>
        <div className="auto-feed-banner">
          <Radar size={15} />
          {gps.error
            ? `GPS issue: ${gps.error}`
            : gps.lastGpsAt
              ? `Last GPS update: ${new Date(gps.lastGpsAt).toLocaleTimeString('en-IN')}`
              : 'Waiting for GPS permission and first location update...'}
        </div>
      </section>

      <section className="worker-grid worker-grid-main">
        <div className="card worker-panel">
          <div className="section-head">
            <div>
              <h3>Coverage Status</h3>
              <p>Live policy identity and validity window</p>
            </div>
            <StatusPill tone={dashboard.coverage.status === 'Active' ? 'safe' : 'warn'}>{dashboard.coverage.status}</StatusPill>
          </div>
          <div className="detail-grid">
            <DetailItem label="Policy ID" value={dashboard.coverage.policyId} />
            <DetailItem label="Coverage Amount" value={formatCurrency(dashboard.coverage.coverageAmount)} />
            <DetailItem label="Premium Paid" value={formatCurrency(dashboard.coverage.premiumPaid)} />
            <DetailItem label="Policy Start Date" value={dashboard.coverage.startDate} />
            <DetailItem label="Expiry Date" value={dashboard.coverage.expiryDate} />
            <DetailItem label="Coverage Status" value={dashboard.coverage.status} />
          </div>
        </div>

        <div className="card worker-panel">
          <div className="section-head">
            <div>
              <h3>Earnings Protection</h3>
              <p>AI-backed weekly earnings safety net</p>
            </div>
            <StatusPill tone="info">Protected</StatusPill>
          </div>
          <div className="protection-stack">
            <div className="highlight-stat">
              <span>Total Earnings Protected</span>
              <strong>{formatCurrency(dashboard.protection.totalEarningsProtected)}</strong>
            </div>
            <div className="highlight-stat">
              <span>Weekly Coverage Limit</span>
              <strong>{formatCurrency(dashboard.protection.weeklyCoverageLimit)}</strong>
            </div>
            <div className="protection-progress">
              <div style={{ width: `${Math.min((dashboard.protection.totalEarningsProtected / Math.max(dashboard.protection.weeklyCoverageLimit * 4, 1)) * 100, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="card worker-panel">
          <div className="section-head">
            <div>
              <h3>Fraud Safety Indicator</h3>
              <p>Model score for anomalous claim behavior</p>
            </div>
            <StatusPill tone={dashboard.fraud.riskScore <= 10 ? 'safe' : 'warn'}>{dashboard.fraud.status}</StatusPill>
          </div>
          <div className="fraud-gauge">
            <div className="fraud-ring">
              <strong>{dashboard.fraud.riskScore}%</strong>
            </div>
            <div>
              <span className="muted-label">Fraud Risk Score</span>
              <div className="fraud-status">{dashboard.fraud.status}</div>
              <p className="muted-copy">Low scores indicate your historical claims pattern looks healthy and consistent with verified disruptions.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="worker-grid worker-grid-tables">
        <div className="card worker-panel">
          <div className="section-head">
            <div>
              <h3>Claims Table</h3>
              <p>Recent event-triggered claims across rain, flood, and platform outages</p>
            </div>
          </div>
          <DashboardTable
            columns={[
              { key: 'claimId', label: 'Claim ID' },
              { key: 'eventType', label: 'Event Type' },
              { key: 'status', label: 'Claim Status' },
              { key: 'amount', label: 'Claim Amount' },
              { key: 'date', label: 'Date' },
            ]}
            rows={dashboard.claims.map(claim => ({
              ...claim,
              status: <StatusPill tone={claim.status === 'Approved' ? 'safe' : claim.status === 'Pending' ? 'warn' : 'danger'}>{claim.status}</StatusPill>,
              amount: formatCurrency(claim.amount),
            }))}
          />
        </div>

        <div className="card worker-panel">
          <div className="section-head">
            <div>
              <h3>Payout History</h3>
              <p>Every settlement sent to your payout rails</p>
            </div>
          </div>
          <DashboardTable
            columns={[
              { key: 'transactionId', label: 'Transaction ID' },
              { key: 'amount', label: 'Amount' },
              { key: 'date', label: 'Date' },
              { key: 'paymentMethod', label: 'Payment Method' },
              { key: 'status', label: 'Status' },
            ]}
            rows={dashboard.payouts.map(payout => ({
              ...payout,
              amount: formatCurrency(payout.amount),
              status: <StatusPill tone="safe">{payout.status}</StatusPill>,
            }))}
          />
        </div>
      </section>

      {loading && <div className="worker-loading-note">Refreshing dashboard analytics...</div>}

      <div className="worker-footer-actions">
        <button className="btn-outline" onClick={() => navigateWorker('premium')}>Open Premium Calculator</button>
        <button className="btn-primary" onClick={() => navigateWorker('claims')}>
          Review Claims
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="dashboard-table">
        <thead>
          <tr>
            {columns.map(column => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.claimId || row.transactionId || rowIndex}>
              {columns.map(column => <td key={column.key}>{row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
