import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, ShieldCheck, Wallet } from 'lucide-react';
import { adminAPI } from '../api';

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
}

function calcRiskRate(rows) {
  const total = Number(rows?.length || 0);
  if (!total) return 0;
  const risky = rows.filter((row) => Number(row?.fraudScore || 0) >= 50).length;
  return Number(((risky / total) * 100).toFixed(1));
}

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState({
    summary: { totalPolicies: 0, activePolicies: 0, totalPremiumCollected: 0, totalClaims: 0, totalPayouts: 0 },
    policyByType: [],
    claimsByStatus: [],
    topRiskUsers: [],
    workersData: [],
  });

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await adminAPI.analytics();
        if (!ignore) {
          setAnalytics(data || analytics);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.response?.data?.message || 'Unable to load analytics right now.');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const riskRate = useMemo(() => calcRiskRate(analytics.topRiskUsers || []), [analytics]);

  return (
    <div className="admin-grid" style={{ gap: 16 }}>
      <section className="admin-hero">
        <div>
          <span className="admin-kicker">Analytics Overview</span>
          <h1>Operational analytics for fraud, payouts, and policy activity.</h1>
          <p>Live metrics are sourced from existing admin analytics APIs without changing backend logic.</p>
        </div>
      </section>

      {error && (
        <div className="admin-alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      <section className="admin-metrics-grid">
        <div className="admin-metric-card" style={{ '--metric-accent': '#00d4f5' }}>
          <div className="admin-metric-icon"><Activity size={18} /></div>
          <div className="admin-metric-copy">
            <span>Total Policies</span>
            <strong>{loading ? '--' : analytics.summary.totalPolicies}</strong>
            <small>Active: {loading ? '--' : analytics.summary.activePolicies}</small>
          </div>
        </div>
        <div className="admin-metric-card" style={{ '--metric-accent': '#10b981' }}>
          <div className="admin-metric-icon"><Wallet size={18} /></div>
          <div className="admin-metric-copy">
            <span>Premium Collected</span>
            <strong>{loading ? '--' : formatCurrency(analytics.summary.totalPremiumCollected)}</strong>
            <small>Total payouts: {loading ? '--' : formatCurrency(analytics.summary.totalPayouts)}</small>
          </div>
        </div>
        <div className="admin-metric-card" style={{ '--metric-accent': '#f59e0b' }}>
          <div className="admin-metric-icon"><BarChart3 size={18} /></div>
          <div className="admin-metric-copy">
            <span>Total Claims</span>
            <strong>{loading ? '--' : analytics.summary.totalClaims}</strong>
            <small>Current claim risk rate: {loading ? '--' : `${riskRate}%`}</small>
          </div>
        </div>
        <div className="admin-metric-card" style={{ '--metric-accent': '#ef4444' }}>
          <div className="admin-metric-icon"><ShieldCheck size={18} /></div>
          <div className="admin-metric-copy">
            <span>High-Risk Users</span>
            <strong>{loading ? '--' : analytics.topRiskUsers.length}</strong>
            <small>Fraud score-based prioritization for review</small>
          </div>
        </div>
      </section>

      <section className="card admin-panel">
        <div className="section-head">
          <div>
            <h3>Top Risk Users</h3>
            <p>Use this queue to investigate anomaly-heavy policy holders.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Fraud Score</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.topRiskUsers || []).length === 0 && (
                <tr>
                  <td colSpan={4}>{loading ? 'Loading analytics...' : 'No risk users found.'}</td>
                </tr>
              )}
              {(analytics.topRiskUsers || []).map((row) => (
                <tr key={row.userId}>
                  <td>{row.userId}</td>
                  <td>{row.name}</td>
                  <td>{row.phone}</td>
                  <td>{row.fraudScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card admin-panel">
        <div className="section-head">
          <div>
            <h3>Workers Details</h3>
            <p>Operational snapshot of worker profile, policy, claims, and payouts.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>City / Area</th>
                <th>Policy</th>
                <th>Claims</th>
                <th>Fraud</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.workersData || []).length === 0 && (
                <tr>
                  <td colSpan={6}>{loading ? 'Loading workers...' : 'No worker data available.'}</td>
                </tr>
              )}
              {(analytics.workersData || []).slice(0, 100).map((row) => (
                <tr key={row.workerId}>
                  <td>
                    <strong>{row.name || '-'}</strong>
                    <br />
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>{row.phone || '-'}</span>
                  </td>
                  <td>{row.city || '-'} / {row.area || '-'}</td>
                  <td>{row.policyPlan || '-'} ({row.policyStatus || '-'})</td>
                  <td>{row.claims?.total || 0} total</td>
                  <td>{row.claims?.latestFraudStatus || 'NONE'} ({row.claims?.latestFraudScore || 0})</td>
                  <td>{formatCurrency(row.payouts?.totalAmount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
