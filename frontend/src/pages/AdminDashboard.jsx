import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CloudRain, RefreshCw, ShieldAlert, SlidersHorizontal, Wallet } from 'lucide-react';
import { adminAPI, monitorAPI, simulateAPI } from '../api';

const POLL_INTERVAL_MS = 4000;
const SECTION_IDS = {
  overview: 'admin-overview-section',
  claims: 'admin-claims-section',
  workers: 'admin-workers-section',
};

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatCoord(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(5);
}

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN');
}

function mapTriggerLabel(type) {
  const raw = String(type || 'UNKNOWN').toLowerCase();
  if (raw === 'weather') return 'Weather';
  if (raw === 'downtime') return 'Downtime';
  if (raw === 'strike') return 'Strike';
  if (raw === 'accident') return 'Accident';
  if (raw === 'account_block') return 'Account Block';
  return String(type || 'Unknown');
}

function toMillis(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isHighRisk(entry) {
  return String(entry?.fraudCheck?.status || '').toUpperCase() === 'HIGH_RISK';
}

function isMediumRisk(entry) {
  return String(entry?.fraudCheck?.status || '').toUpperCase() === 'MEDIUM_RISK';
}

function isLowRisk(entry) {
  return String(entry?.fraudCheck?.status || '').toUpperCase() === 'LOW_RISK';
}

function normalizeReasonBuckets(entries) {
  const reasons = {
    'GPS mismatch': 0,
    'High frequency': 0,
    'Timing anomaly': 0,
    'Weather mismatch': 0,
    'Repeat offender': 0,
    'Anomaly pattern': 0,
  };

  for (const entry of entries) {
    const list = entry?.fraudCheck?.reasons || [];
    if (list.some((item) => /gps|mismatch|inconsisten/i.test(item))) reasons['GPS mismatch'] += 1;
    if (list.some((item) => /high\s*claim\s*frequency|frequency/i.test(item))) reasons['High frequency'] += 1;
    if (list.some((item) => /timing|unusual/i.test(item))) reasons['Timing anomaly'] += 1;
    if (list.some((item) => /weather|rain/i.test(item))) reasons['Weather mismatch'] += 1;
    if (list.some((item) => /repeat|repeated|offender/i.test(item))) reasons['Repeat offender'] += 1;
    if (list.some((item) => /anomaly|combined risk|risk profile/i.test(item))) reasons['Anomaly pattern'] += 1;
  }

  return reasons;
}

function getLatestIso(values) {
  let latest = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || toMillis(value) > toMillis(latest)) {
      latest = value;
    }
  }
  return latest;
}

function buildLiveFeed(entries) {
  const feed = [];

  for (const entry of entries.slice(0, 10)) {
    const timestamp = entry?.timestamp;
    const time = formatTime(timestamp);
    const triggerLabel = mapTriggerLabel(entry?.event?.type);
    const city = entry?.event?.meta?.city || entry?.event?.meta?.zone || 'Unknown';
    const auto = entry?.event?.meta?.autoMonitored;
    const claimId = entry?.claim?.claimId || `evt-${toMillis(timestamp)}`;

    feed.push({
      id: `${claimId}-trigger`,
      timestamp,
      text: `[${time}] ${auto ? 'Auto Claim Triggered' : 'Manual Claim Triggered'} (${triggerLabel} - ${city})`,
    });

    feed.push({
      id: `${claimId}-fraud`,
      timestamp,
      text: `[${time}] Fraud Check: ${String(entry?.fraudCheck?.status || 'UNKNOWN').replaceAll('_', ' ')}`,
    });

    feed.push({
      id: `${claimId}-payout`,
      timestamp,
      text: `[${time}] ${entry?.payout ? `Rs ${entry.payout.amount} Payout Processed` : 'Payout Blocked'}`,
    });
  }

  return feed.slice(0, 12);
}

function deriveRiskPrediction(monitoring, rainThreshold) {
  const users = monitoring?.users || [];
  const observedRainfall = users.length
    ? Math.max(...users.map((user) => Number(user?.lastObservedRainfall || 0)))
    : 0;
  const threshold = Number(rainThreshold || monitoring?.config?.rainThreshold || 60);

  const ratio = threshold > 0 ? observedRainfall / threshold : 0;
  let nextRiskLevel = 'LOW';
  let expectedClaims = 1;
  let riskReason = 'Rainfall well below threshold -> low immediate risk';

  if (ratio >= 1) {
    nextRiskLevel = 'HIGH';
    expectedClaims = 6;
    riskReason = 'Rainfall crossed threshold -> high auto-trigger probability';
  } else if (ratio >= 0.8) {
    nextRiskLevel = 'MEDIUM';
    expectedClaims = 3;
    riskReason = 'Rainfall close to threshold -> moderate risk';
  } else if (ratio >= 0.55) {
    nextRiskLevel = 'MEDIUM';
    expectedClaims = 2;
    riskReason = 'Rainfall rising toward threshold -> watch closely';
  }

  return {
    currentRainfall: Number(observedRainfall.toFixed(1)),
    threshold,
    nextRiskLevel,
    expectedClaims,
    riskReason,
  };
}

function riskLevelFromScore(score) {
  const numeric = Number(score || 0);
  if (numeric >= 70) return 'HIGH';
  if (numeric >= 40) return 'MEDIUM';
  return 'LOW';
}

function pillClassForFraudStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized.includes('HIGH')) return 'pill pill-danger';
  if (normalized.includes('MEDIUM')) return 'pill pill-warn';
  return 'pill pill-safe';
}

function pillClassForPayoutStatus(status) {
  return String(status || '').toUpperCase() === 'PAID' ? 'pill pill-safe' : 'pill pill-danger';
}

function pillClassForTriggerType(type) {
  return String(type || '').toUpperCase() === 'AUTO' ? 'pill pill-info' : 'pill pill-neutral';
}

function buildWorkerInsights(entries) {
  const bucket = new Map();

  for (const entry of entries) {
    const workerId = String(entry?.claim?.userId ?? entry?.event?.userId ?? 'unknown');
    if (!bucket.has(workerId)) {
      bucket.set(workerId, {
        workerId,
        totalClaims: 0,
        totalPayoutReceived: 0,
        fraudScoreSum: 0,
        fraudScoreCount: 0,
        highRiskCases: 0,
      });
    }

    const worker = bucket.get(workerId);
    worker.totalClaims += 1;
    worker.totalPayoutReceived += Number(entry?.payout?.amount || 0);
    worker.fraudScoreSum += Number(entry?.fraudCheck?.fraudScore || 0);
    worker.fraudScoreCount += 1;
    if (String(entry?.fraudCheck?.status || '').toUpperCase() === 'HIGH_RISK') {
      worker.highRiskCases += 1;
    }
  }

  const workers = [...bucket.values()].map((worker) => {
    const avgFraudScore = worker.fraudScoreCount
      ? Number((worker.fraudScoreSum / worker.fraudScoreCount).toFixed(1))
      : 0;
    return {
      workerId: worker.workerId,
      totalClaims: worker.totalClaims,
      totalPayoutReceived: worker.totalPayoutReceived,
      avgFraudScore,
      riskLevel: riskLevelFromScore(avgFraudScore),
      highRiskCases: worker.highRiskCases,
    };
  });

  const mostActiveWorker = workers.sort((a, b) => b.totalClaims - a.totalClaims)[0] || null;
  const totalWorkersActive = workers.length;
  const averageClaimsPerWorker = totalWorkersActive
    ? Number((workers.reduce((sum, worker) => sum + worker.totalClaims, 0) / totalWorkersActive).toFixed(1))
    : 0;
  const highRiskWorkers = workers.filter((worker) => worker.highRiskCases >= 2).length;
  const topWorkers = [...workers].sort((a, b) => b.totalClaims - a.totalClaims).slice(0, 5);

  return {
    totalWorkersActive,
    mostActiveWorker,
    averageClaimsPerWorker,
    highRiskWorkers,
    topWorkers,
  };
}

function buildClaimsManagementRows(entries) {
  return entries.slice(0, 200).map((entry) => {
    const fraudStatus = String(entry?.fraudCheck?.status || 'LOW_RISK').toUpperCase();
    const payoutStatus = entry?.payout ? 'PAID' : 'BLOCKED';
    const triggerType = entry?.event?.meta?.autoMonitored ? 'AUTO' : 'MANUAL';

    return {
      claimId: entry?.claim?.claimId || `NA-${toMillis(entry?.timestamp)}`,
      workerId: String(entry?.claim?.userId ?? entry?.event?.userId ?? 'unknown'),
      type: mapTriggerLabel(entry?.event?.type),
      timestamp: entry?.timestamp,
      fraudScore: Number(entry?.fraudCheck?.fraudScore || 0),
      fraudStatus,
      payoutAmount: Number(entry?.payout?.amount || 0),
      payoutStatus,
      triggerType,
      eventMeta: entry?.event?.meta || {},
      fraudReasons: entry?.fraudCheck?.reasons || [],
      decisionLog: entry?.decisionLog || '',
    };
  });
}

function deriveDashboard(timelineEntries, controlData, monitoring) {
  const entries = [...(timelineEntries || [])].sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
  const totalClaims = entries.length;
  const autoTriggeredClaims = entries.filter((entry) => entry?.event?.meta?.autoMonitored === true).length;
  const highRiskClaims = entries.filter(isHighRisk).length;
  const mediumRiskClaims = entries.filter(isMediumRisk).length;
  const lowRiskClaims = entries.filter(isLowRisk).length;
  const payoutEntries = entries.filter((entry) => entry?.payout);
  const totalPayoutAmount = payoutEntries.reduce((sum, entry) => sum + Number(entry?.payout?.amount || 0), 0);
  const averagePayout = payoutEntries.length ? Number((totalPayoutAmount / payoutEntries.length).toFixed(1)) : 0;
  const fraudRate = totalClaims ? Number(((highRiskClaims / totalClaims) * 100).toFixed(1)) : 0;
  const avgFraudScore = totalClaims
    ? Number((entries.reduce((sum, entry) => sum + Number(entry?.fraudCheck?.fraudScore || 0), 0) / totalClaims).toFixed(1))
    : 0;
  const blockedPayouts = totalClaims - payoutEntries.length;

  const activePoliciesFromWorkers = (controlData?.workersData || []).filter(
    (worker) => String(worker?.policyStatus || '').toLowerCase() === 'active',
  ).length;

  const activePolicies = activePoliciesFromWorkers
    || Number(controlData?.systemStats?.activePolicies || 0)
    || Number(controlData?.workersData?.length || 0);

  const feed = buildLiveFeed(entries);
  const lastTwoMinutes = entries.filter((entry) => Date.now() - toMillis(entry.timestamp) <= 2 * 60 * 1000);
  const anomalies = [];
  if (lastTwoMinutes.length >= 3) {
    anomalies.push(`Spike detected: ${lastTwoMinutes.length} claims in last 2 minutes`);
  }

  const monitorUsers = monitoring?.users || [];
  const lastChecked = getLatestIso(monitorUsers.map((user) => user?.lastCheckedAt));
  const lastTriggered = getLatestIso(monitorUsers.map((user) => user?.lastTriggeredAt));

  const thresholdFromConfig = Number(controlData?.config?.rainThreshold || monitoring?.config?.rainThreshold || 60);
  const workerInsights = buildWorkerInsights(entries);
  const claimsManagement = buildClaimsManagementRows(entries);

  return {
    systemStats: {
      totalClaims,
      autoTriggeredClaims,
      fraudRate,
      totalPayoutAmount,
      activePolicies,
    },
    fraudAnalytics: {
      averageFraudScore: avgFraudScore,
      highRiskClaims,
      mediumRiskClaims,
      lowRiskClaims,
      reasonsBreakdown: normalizeReasonBuckets(entries),
    },
    payoutStats: {
      totalPayoutToday: totalPayoutAmount,
      averagePayout,
      approvedPayouts: payoutEntries.length,
      blockedPayouts,
    },
    liveFeed: feed,
    riskPrediction: deriveRiskPrediction(monitoring, thresholdFromConfig),
    claimsTable: entries.slice(0, 40).map((entry) => ({
      claimId: entry?.claim?.claimId || `NA-${toMillis(entry?.timestamp)}`,
      type: mapTriggerLabel(entry?.event?.type),
      fraudScore: Number(entry?.fraudCheck?.fraudScore || 0),
      status: entry?.payout ? 'Approved' : 'Blocked',
      payoutAmount: Number(entry?.payout?.amount || 0),
      source: entry?.event?.meta?.autoMonitored ? 'Auto' : 'Manual',
      timestamp: entry?.timestamp,
    })),
    anomalies,
    monitorStatus: {
      ...(monitoring || { isMonitoring: false, users: [] }),
      lastCheckedAt: lastChecked,
      lastTriggeredAt: lastTriggered,
    },
    workerInsights,
    claimsManagement,
  };
}

function Metric({ title, value, hint }) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </div>
  );
}

function safeData() {
  return {
    systemStats: { totalClaims: 0, autoTriggeredClaims: 0, fraudRate: 0, totalPayoutAmount: 0, activePolicies: 0 },
    fraudAnalytics: {
      averageFraudScore: 0,
      highRiskClaims: 0,
      mediumRiskClaims: 0,
      lowRiskClaims: 0,
      reasonsBreakdown: {
        'GPS mismatch': 0,
        'High frequency': 0,
        'Timing anomaly': 0,
        'Weather mismatch': 0,
        'Repeat offender': 0,
        'Anomaly pattern': 0,
      },
    },
    payoutStats: { totalPayoutToday: 0, averagePayout: 0, approvedPayouts: 0, blockedPayouts: 0 },
    liveFeed: [],
    riskPrediction: {
      currentRainfall: 0,
      threshold: 60,
      nextRiskLevel: 'LOW',
      expectedClaims: 0,
      riskReason: 'Fetching live rainfall signal...',
    },
    claimsTable: [],
    workersData: [],
    anomalies: [],
    monitorStatus: { isMonitoring: false, users: [], lastCheckedAt: null, lastTriggeredAt: null },
    workerInsights: {
      totalWorkersActive: 0,
      mostActiveWorker: null,
      averageClaimsPerWorker: 0,
      highRiskWorkers: 0,
      topWorkers: [],
    },
    claimsManagement: [],
    config: { rainThreshold: 60, fraudSensitivity: 'medium', basePremium: 59, riskMultiplier: 1 },
  };
}

export default function AdminDashboard() {
  const [data, setData] = useState(safeData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rainThreshold, setRainThreshold] = useState(60);
  const [fraudSensitivity, setFraudSensitivity] = useState('medium');
  const [basePremium, setBasePremium] = useState(59);
  const [riskMultiplier, setRiskMultiplier] = useState(1);
  const [workerSearch, setWorkerSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [policyFilter, setPolicyFilter] = useState('all');
  const [monitorFilter, setMonitorFilter] = useState('all');
  const [claimSearch, setClaimSearch] = useState('');
  const [claimRiskFilter, setClaimRiskFilter] = useState('all');
  const [claimTriggerFilter, setClaimTriggerFilter] = useState('all');
  const [claimPayoutFilter, setClaimPayoutFilter] = useState('all');
  const [claimSortBy, setClaimSortBy] = useState('time');
  const [claimSortDir, setClaimSortDir] = useState('desc');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [newFeedIds, setNewFeedIds] = useState([]);
  const newestSeenTs = useRef(0);

  const load = useCallback(async () => {
    if (!loading) setRefreshing(true);
    try {
      const [{ data: controlRes }, { data: monitorRes }] = await Promise.all([
        adminAPI.controlCenter(),
        monitorAPI.status(),
      ]);

      const monitorStatus = monitorRes?.monitoring || { isMonitoring: false, users: [] };
      const workerIds = (controlRes?.workersData || []).map((worker) => String(worker.workerId || '')).filter(Boolean);
      const monitorUserIds = (monitorStatus?.users || []).map((worker) => String(worker.userId || '')).filter(Boolean);

      const uniqueUserIds = [...new Set([...workerIds, ...monitorUserIds])];
      if (!uniqueUserIds.length) uniqueUserIds.push('demo-worker-001');

      const timelineResults = await Promise.allSettled(uniqueUserIds.map((userId) => simulateAPI.detailedTimeline(userId)));
      const timelineEntries = timelineResults.flatMap((result) => {
        if (result.status !== 'fulfilled') return [];
        return result.value?.data?.entries || [];
      });

      const derived = deriveDashboard(timelineEntries, controlRes, monitorStatus);
      const mergedData = {
        ...safeData(),
        ...controlRes,
        ...derived,
        workersData: controlRes?.workersData || [],
        config: controlRes?.config || { rainThreshold: 60, fraudSensitivity: 'medium', basePremium: 59, riskMultiplier: 1 },
      };

      const currentMaxTs = Math.max(0, ...mergedData.liveFeed.map((item) => toMillis(item.timestamp)));
      const freshIds = mergedData.liveFeed
        .filter((item) => toMillis(item.timestamp) > newestSeenTs.current)
        .map((item) => item.id);

      if (freshIds.length) {
        setNewFeedIds(freshIds);
        setTimeout(() => setNewFeedIds([]), 2200);
      }

      newestSeenTs.current = Math.max(newestSeenTs.current, currentMaxTs);
      setData(mergedData);
      setRainThreshold(Number(mergedData?.config?.rainThreshold || 60));
      setFraudSensitivity(String(mergedData?.config?.fraudSensitivity || 'medium'));
      setBasePremium(Number(mergedData?.config?.basePremium || 59));
      setRiskMultiplier(Number(mergedData?.config?.riskMultiplier || 1));
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load control center data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loading]);

  useEffect(() => {
    let stopped = false;
    load();
    const id = setInterval(() => {
      if (!stopped) load();
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [load]);

  const metrics = useMemo(() => [
    { title: 'Total Claims', value: data.systemStats.totalClaims, hint: 'Across all monitored users' },
    { title: 'Auto Triggered', value: data.systemStats.autoTriggeredClaims, hint: 'Zero-touch claims' },
    { title: 'Fraud Rate', value: `${data.systemStats.fraudRate}%`, hint: 'High-risk ratio' },
    { title: 'Active Policies', value: data.systemStats.activePolicies, hint: 'Live coverage footprint' },
    { title: 'Total Payouts', value: formatCurrency(data.systemStats.totalPayoutAmount), hint: 'Cumulative payouts' },
  ], [data.systemStats]);

  const applyConfig = async () => {
    setSaving(true);
    try {
      await adminAPI.config({ rainThreshold, fraudSensitivity, basePremium, riskMultiplier });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to apply config');
    } finally {
      setSaving(false);
    }
  };

  const toggleMonitor = async () => {
    try {
      if (data.monitorStatus?.isMonitoring) {
        await monitorAPI.stop({ userId: 'demo-worker-001' });
      } else {
        await monitorAPI.start({ userId: 'demo-worker-001', city: 'Mumbai', intervalSec: 35, rainfallThreshold: rainThreshold });
      }
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to toggle monitor');
    }
  };

  const filteredWorkers = useMemo(() => {
    const search = workerSearch.trim().toLowerCase();
    return (data.workersData || []).filter((worker) => {
      const matchesSearch = !search
        || String(worker.name || '').toLowerCase().includes(search)
        || String(worker.phone || '').toLowerCase().includes(search)
        || String(worker.city || '').toLowerCase().includes(search)
        || String(worker.area || '').toLowerCase().includes(search)
        || String(worker.workerId || '').toLowerCase().includes(search);

      const matchesKyc = kycFilter === 'all'
        || (kycFilter === 'verified' ? worker.kycVerified : !worker.kycVerified);

      const policyStatus = String(worker.policyStatus || '').toLowerCase();
      const hasPolicy = String(worker.policyPlan || '').trim() && String(worker.policyPlan || '').trim() !== '-';
      const matchesPolicy = policyFilter === 'all'
        || (policyFilter === 'active' && policyStatus === 'active')
        || (policyFilter === 'inactive' && policyStatus !== 'active' && hasPolicy)
        || (policyFilter === 'none' && !hasPolicy);

      const matchesMonitor = monitorFilter === 'all'
        || (monitorFilter === 'active' ? worker.monitor?.active : !worker.monitor?.active);

      return matchesSearch && matchesKyc && matchesPolicy && matchesMonitor;
    });
  }, [data.workersData, workerSearch, kycFilter, policyFilter, monitorFilter]);

  const claimsRows = useMemo(() => {
    const search = claimSearch.trim().toLowerCase();
    const filtered = (data.claimsManagement || []).filter((row) => {
      const matchesSearch = !search || String(row.workerId).toLowerCase().includes(search) || String(row.claimId).toLowerCase().includes(search);
      const matchesRisk = claimRiskFilter === 'all' || String(row.fraudStatus) === claimRiskFilter;
      const matchesTrigger = claimTriggerFilter === 'all' || String(row.triggerType) === claimTriggerFilter;
      const matchesPayout = claimPayoutFilter === 'all' || String(row.payoutStatus) === claimPayoutFilter;
      return matchesSearch && matchesRisk && matchesTrigger && matchesPayout;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (claimSortBy === 'fraud') return claimSortDir === 'asc' ? a.fraudScore - b.fraudScore : b.fraudScore - a.fraudScore;
      if (claimSortBy === 'payout') return claimSortDir === 'asc' ? a.payoutAmount - b.payoutAmount : b.payoutAmount - a.payoutAmount;
      const delta = toMillis(a.timestamp) - toMillis(b.timestamp);
      return claimSortDir === 'asc' ? delta : -delta;
    });

    return sorted;
  }, [data.claimsManagement, claimSearch, claimRiskFilter, claimTriggerFilter, claimPayoutFilter, claimSortBy, claimSortDir]);

  const exportWorkersCsv = () => {
    const rows = filteredWorkers.map((worker) => ({
      workerId: worker.workerId,
      name: worker.name,
      phone: worker.phone,
      email: worker.email,
      kycVerified: worker.kycVerified ? 'yes' : 'no',
      aadhaarLast4: worker.aadhaarLast4,
      policyPlan: worker.policyPlan,
      policyStatus: worker.policyStatus,
      premium: worker.premium,
      coverage: worker.coverage,
      platforms: (worker.platforms || []).join('|'),
      city: worker.city,
      area: worker.area,
      riskScore: worker.riskScore,
      gpsLat: worker.gps?.lat ?? '',
      gpsLng: worker.gps?.lng ?? '',
      gpsAccuracy: worker.gps?.accuracy ?? '',
      monitorActive: worker.monitor?.active ? 'yes' : 'no',
      monitorRainfall: worker.monitor?.lastObservedRainfall ?? 0,
      claimsTotal: worker.claims?.total ?? 0,
      claimsApproved: worker.claims?.approved ?? 0,
      claimsBlocked: worker.claims?.blocked ?? 0,
      fraudStatus: worker.claims?.latestFraudStatus ?? '',
      fraudScore: worker.claims?.latestFraudScore ?? 0,
      payoutTotal: worker.payouts?.totalAmount ?? 0,
      createdAt: worker.createdAt ?? '',
    }));

    const headers = Object.keys(rows[0] || {
      workerId: '',
      name: '',
      phone: '',
      email: '',
      kycVerified: '',
      aadhaarLast4: '',
      policyPlan: '',
      policyStatus: '',
      premium: '',
      coverage: '',
      platforms: '',
      city: '',
      area: '',
      riskScore: '',
      gpsLat: '',
      gpsLng: '',
      gpsAccuracy: '',
      monitorActive: '',
      monitorRainfall: '',
      claimsTotal: '',
      claimsApproved: '',
      claimsBlocked: '',
      fraudStatus: '',
      fraudScore: '',
      payoutTotal: '',
      createdAt: '',
    });

    const csvLines = [headers.join(',')];
    for (const row of rows) {
      const values = headers.map((header) => {
        const value = String(row[header] ?? '').replace(/"/g, '""');
        return `"${value}"`;
      });
      csvLines.push(values.join(','));
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `payguard-workers-${dateTag}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
        <section id={SECTION_IDS.overview} className="admin-hero">
          <div>
            <div className="admin-kicker">Live monitoring + explainable automation</div>
            <h1>Admin Dashboard</h1>
            <p>End-to-end visibility into triggers, fraud decisions, payouts, anomalies, and policy risk.</p>
          </div>
          <div className="admin-hero-actions">
            <div className="event-chip">{refreshing ? 'Fetching live data...' : `Auto refresh every ${Math.round(POLL_INTERVAL_MS / 1000)}s`}</div>
            <button className="btn-outline" onClick={load}><RefreshCw size={14} /> Refresh Now</button>
          </div>
        </section>

        {loading && <div className="worker-loading-note">Fetching live data...</div>}
        {error && <div className="admin-alert">{error}</div>}
        {data.anomalies?.length > 0 && (
          <div className="admin-alert" style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#fbbf24' }}>
            <AlertTriangle size={15} style={{ marginRight: 8 }} />
            {data.anomalies.join(' | ')}
          </div>
        )}

        <section className="admin-metrics-grid">
          {metrics.map((item) => <Metric key={item.title} {...item} />)}
        </section>

        <section className="admin-grid admin-grid-two">
          <section className="card admin-panel">
            <div className="section-head"><h3><Activity size={15} /> Live Activity Feed</h3></div>
            <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gap: 8 }}>
              {data.liveFeed?.slice(0, 12).map((event) => (
                <div
                  key={event.id}
                  className={`live-feed-item ${newFeedIds.includes(event.id) ? 'live-feed-item-new' : ''}`}
                >
                  <span className="live-feed-time">{formatTime(event.timestamp)}</span>
                  <span>{event.text}</span>
                  {newFeedIds.includes(event.id) && <span className="live-feed-badge">NEW</span>}
                </div>
              ))}
              {!data.liveFeed?.length && <div style={{ color: 'var(--text3)', fontSize: 13 }}>No live events yet. Waiting for timeline activity...</div>}
            </div>
          </section>

          <section className="card admin-panel">
            <div className="section-head"><h3><CloudRain size={15} /> Risk Prediction</h3></div>
            <div className="stat-grid">
              <div className="stat-box"><span>Current Rainfall</span><strong>{data.riskPrediction.currentRainfall} mm</strong></div>
              <div className="stat-box"><span>Threshold</span><strong>{data.riskPrediction.threshold} mm</strong></div>
              <div className="stat-box"><span>Next Risk Level</span><strong>{data.riskPrediction.nextRiskLevel}</strong></div>
              <div className="stat-box"><span>Expected Claims</span><strong>{data.riskPrediction.expectedClaims}</strong></div>
              <div className="stat-box" style={{ gridColumn: '1 / -1' }}>
                <span>Risk Reason</span>
                <strong style={{ fontSize: 14, lineHeight: 1.5 }}>{data.riskPrediction.riskReason}</strong>
              </div>
            </div>
          </section>
        </section>

        <section id="admin-analytics-section" className="admin-grid admin-grid-two">
          <section className="card admin-panel">
            <div className="section-head"><h3><ShieldAlert size={15} /> Fraud Analytics</h3></div>
            <div className="stat-grid">
              <div className="stat-box"><span>Avg Fraud Score</span><strong>{data.fraudAnalytics.averageFraudScore}</strong></div>
              <div className="stat-box"><span>LOW RISK</span><strong>{data.fraudAnalytics.lowRiskClaims}</strong></div>
              <div className="stat-box"><span>MEDIUM RISK</span><strong>{data.fraudAnalytics.mediumRiskClaims}</strong></div>
              <div className="stat-box"><span>HIGH RISK</span><strong>{data.fraudAnalytics.highRiskClaims}</strong></div>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {Object.entries(data.fraudAnalytics.reasonsBreakdown || {}).map(([label, count]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)', fontSize: 13 }}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card admin-panel">
            <div className="section-head"><h3><Wallet size={15} /> Payout Analytics</h3></div>
            <div className="stat-grid">
              <div className="stat-box"><span>Total Payout</span><strong>{formatCurrency(data.payoutStats.totalPayoutToday)}</strong></div>
              <div className="stat-box"><span>Average Payout</span><strong>{formatCurrency(data.payoutStats.averagePayout)}</strong></div>
              <div className="stat-box"><span>Approved</span><strong>{data.payoutStats.approvedPayouts}</strong></div>
              <div className="stat-box"><span>Blocked</span><strong>{data.payoutStats.blockedPayouts}</strong></div>
            </div>
          </section>
        </section>

        <section id="admin-control-section" className="card admin-panel">
          <div className="section-head"><h3><SlidersHorizontal size={15} /> Control Panel</h3></div>
          <div className="prediction-grid">
            <div className="prediction-card">
              <span>Auto-Monitoring</span>
              <strong>{data.monitorStatus?.isMonitoring ? 'Running' : 'Stopped'}</strong>
              <button className="btn-primary" onClick={toggleMonitor} style={{ marginTop: 10, justifyContent: 'center' }}>
                {data.monitorStatus?.isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
              </button>
            </div>
            <div className="prediction-card">
              <span>Last Checked</span>
              <strong style={{ fontSize: 16 }}>{formatDateTime(data.monitorStatus?.lastCheckedAt)}</strong>
              <span style={{ marginTop: 10 }}>Last Trigger</span>
              <strong style={{ fontSize: 16 }}>{formatDateTime(data.monitorStatus?.lastTriggeredAt)}</strong>
            </div>
            <div className="prediction-card">
              <span>Rain Threshold (mm)</span>
              <input className="input-field" type="number" min={1} value={rainThreshold} onChange={(e) => setRainThreshold(Number(e.target.value || 60))} />
            </div>
            <div className="prediction-card">
              <span>Fraud Sensitivity</span>
              <select className="input-field" value={fraudSensitivity} onChange={(e) => setFraudSensitivity(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="prediction-card">
              <span>Base Premium</span>
              <input className="input-field" type="number" min={20} value={basePremium} onChange={(e) => setBasePremium(Number(e.target.value || 59))} />
            </div>
            <div className="prediction-card">
              <span>Risk Multiplier</span>
              <input className="input-field" type="number" min={0.5} max={3} step={0.1} value={riskMultiplier} onChange={(e) => setRiskMultiplier(Number(e.target.value || 1))} />
            </div>
          </div>
          <button className="btn-outline" onClick={applyConfig} disabled={saving} style={{ marginTop: 12 }}>
            {saving ? 'Saving...' : 'Apply Config'}
          </button>
        </section>

        <section id={SECTION_IDS.claims} className="card admin-panel">
          <div className="section-head"><h3>Worker Insights</h3></div>
          <div className="admin-metrics-grid" style={{ marginBottom: 12 }}>
            <Metric
              title="Total Workers Active"
              value={data.workerInsights.totalWorkersActive}
              hint="Workers with timeline activity"
            />
            <Metric
              title="Most Active Worker"
              value={data.workerInsights.mostActiveWorker?.workerId || '--'}
              hint={`${data.workerInsights.mostActiveWorker?.totalClaims || 0} claims`}
            />
            <Metric
              title="Avg Claims per Worker"
              value={data.workerInsights.averageClaimsPerWorker}
              hint="Live rolling average"
            />
            <Metric
              title="High Risk Workers"
              value={data.workerInsights.highRiskWorkers}
              hint="2+ high-risk cases"
            />
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Worker ID</th>
                  <th>Total Claims</th>
                  <th>Total Payout Received</th>
                  <th>Avg Fraud Score</th>
                  <th>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {(data.workerInsights.topWorkers || []).map((worker) => (
                  <tr key={`insight-${worker.workerId}`}>
                    <td>{worker.workerId}</td>
                    <td>{worker.totalClaims}</td>
                    <td>{formatCurrency(worker.totalPayoutReceived)}</td>
                    <td>{worker.avgFraudScore}</td>
                    <td>
                      <span className={worker.riskLevel === 'HIGH' ? 'pill pill-danger' : worker.riskLevel === 'MEDIUM' ? 'pill pill-warn' : 'pill pill-safe'}>
                        {worker.riskLevel}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data.workerInsights.topWorkers?.length && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text3)' }}>No worker insight data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="section-head" style={{ marginTop: 10, alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h3>Claims Management</h3>
              <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6 }}>
                {claimsRows.length} claims after filters (click a row for full details)
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input-field"
                placeholder="Search Worker ID or Claim ID"
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                style={{ minWidth: 220, height: 38 }}
              />
              <select className="input-field" value={claimRiskFilter} onChange={(e) => setClaimRiskFilter(e.target.value)} style={{ minWidth: 150, height: 38 }}>
                <option value="all">Fraud: All</option>
                <option value="HIGH_RISK">Fraud: HIGH_RISK</option>
                <option value="MEDIUM_RISK">Fraud: MEDIUM_RISK</option>
                <option value="LOW_RISK">Fraud: LOW_RISK</option>
              </select>
              <select className="input-field" value={claimTriggerFilter} onChange={(e) => setClaimTriggerFilter(e.target.value)} style={{ minWidth: 150, height: 38 }}>
                <option value="all">Trigger: All</option>
                <option value="AUTO">AUTO</option>
                <option value="MANUAL">MANUAL</option>
              </select>
              <select className="input-field" value={claimPayoutFilter} onChange={(e) => setClaimPayoutFilter(e.target.value)} style={{ minWidth: 160, height: 38 }}>
                <option value="all">Payout: All</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="PAID">PAID</option>
              </select>
              <select className="input-field" value={claimSortBy} onChange={(e) => setClaimSortBy(e.target.value)} style={{ minWidth: 130, height: 38 }}>
                <option value="time">Sort: Time</option>
                <option value="fraud">Sort: Fraud</option>
                <option value="payout">Sort: Payout</option>
              </select>
              <select className="input-field" value={claimSortDir} onChange={(e) => setClaimSortDir(e.target.value)} style={{ minWidth: 130, height: 38 }}>
                <option value="desc">Order: Desc</option>
                <option value="asc">Order: Asc</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Worker ID</th>
                  <th>Type</th>
                  <th>Timestamp</th>
                  <th>Fraud Score</th>
                  <th>Fraud Status</th>
                  <th>Payout Amount</th>
                  <th>Payout Status</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {claimsRows.slice(0, 120).map((claim) => (
                  <tr key={`claims-management-${claim.claimId}-${claim.timestamp}`} onClick={() => setSelectedClaim(claim)} style={{ cursor: 'pointer' }}>
                    <td>{claim.claimId}</td>
                    <td>{claim.workerId}</td>
                    <td>{claim.type}</td>
                    <td>{new Date(claim.timestamp).toLocaleString('en-IN')}</td>
                    <td>{claim.fraudScore}</td>
                    <td><span className={pillClassForFraudStatus(claim.fraudStatus)}>{claim.fraudStatus}</span></td>
                    <td>{formatCurrency(claim.payoutAmount)}</td>
                    <td><span className={pillClassForPayoutStatus(claim.payoutStatus)}>{claim.payoutStatus}</span></td>
                    <td><span className={pillClassForTriggerType(claim.triggerType)}>{claim.triggerType}</span></td>
                  </tr>
                ))}
                {!claimsRows.length && (
                  <tr>
                    <td colSpan={9} style={{ color: 'var(--text3)' }}>No claims found for selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id={SECTION_IDS.workers} className="card admin-panel" style={{ marginTop: 16 }}>
          <div className="section-head" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h3>All Workers Details</h3>
              <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6 }}>
                {filteredWorkers.length} of {(data.workersData || []).length} workers shown (restricted to Lakshit)
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input-field"
                placeholder="Search name, phone, city"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                style={{ minWidth: 220, height: 38 }}
              />
              <select className="input-field" value={kycFilter} onChange={(e) => setKycFilter(e.target.value)} style={{ minWidth: 130, height: 38 }}>
                <option value="all">KYC: All</option>
                <option value="verified">KYC: Verified</option>
                <option value="pending">KYC: Pending</option>
              </select>
              <select className="input-field" value={policyFilter} onChange={(e) => setPolicyFilter(e.target.value)} style={{ minWidth: 140, height: 38 }}>
                <option value="all">Policy: All</option>
                <option value="active">Policy: Active</option>
                <option value="inactive">Policy: Inactive</option>
                <option value="none">Policy: None</option>
              </select>
              <select className="input-field" value={monitorFilter} onChange={(e) => setMonitorFilter(e.target.value)} style={{ minWidth: 145, height: 38 }}>
                <option value="all">Monitor: All</option>
                <option value="active">Monitor: Active</option>
                <option value="inactive">Monitor: Inactive</option>
              </select>
              <button className="btn-outline" onClick={exportWorkersCsv}>Export CSV</button>
            </div>
          </div>

          {filteredWorkers[0] && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="card-sm">
                <span className="muted-label">Primary Worker</span>
                <strong>{filteredWorkers[0].name}</strong>
                <p className="muted-copy" style={{ marginTop: 4 }}>{filteredWorkers[0].phone}</p>
              </div>
              <div className="card-sm">
                <span className="muted-label">Policy Status</span>
                <strong>{filteredWorkers[0].policyPlan} ({filteredWorkers[0].policyStatus})</strong>
                <p className="muted-copy" style={{ marginTop: 4 }}>Coverage {formatCurrency(filteredWorkers[0].coverage)}</p>
              </div>
              <div className="card-sm">
                <span className="muted-label">Claims Snapshot</span>
                <strong>{filteredWorkers[0].claims?.total || 0} total</strong>
                <p className="muted-copy" style={{ marginTop: 4 }}>Approved {filteredWorkers[0].claims?.approved || 0} | Blocked {filteredWorkers[0].claims?.blocked || 0}</p>
              </div>
              <div className="card-sm">
                <span className="muted-label">Payout Total</span>
                <strong>{formatCurrency(filteredWorkers[0].payouts?.totalAmount || 0)}</strong>
                <p className="muted-copy" style={{ marginTop: 4 }}>Fraud {filteredWorkers[0].claims?.latestFraudStatus || 'NONE'}</p>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>KYC</th>
                  <th>Policy</th>
                  <th>Platforms</th>
                  <th>Zone / GPS</th>
                  <th>Monitoring</th>
                  <th>Claims</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.slice(0, 300).map((worker) => (
                  <tr key={worker.workerId}>
                    <td>
                      <strong>{worker.name}</strong>
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>{worker.phone}</span>
                    </td>
                    <td>
                      {worker.kycVerified ? 'Verified' : 'Pending'}
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>Aadhaar: {worker.aadhaarLast4}</span>
                    </td>
                    <td>
                      {worker.policyPlan} ({worker.policyStatus})
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                        P: {formatCurrency(worker.premium)} | C: {formatCurrency(worker.coverage)}
                      </span>
                    </td>
                    <td>{(worker.platforms || []).join(', ') || '-'}</td>
                    <td>
                      {worker.city}, {worker.area}
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                        {formatCoord(worker.gps?.lat)}, {formatCoord(worker.gps?.lng)}
                      </span>
                    </td>
                    <td>
                      {worker.monitor?.active ? 'Active' : 'Idle'}
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                        Rain: {worker.monitor?.lastObservedRainfall || 0} mm
                      </span>
                    </td>
                    <td>
                      T:{worker.claims?.total || 0} A:{worker.claims?.approved || 0} B:{worker.claims?.blocked || 0}
                      <br />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                        Fraud: {worker.claims?.latestFraudStatus} ({worker.claims?.latestFraudScore})
                      </span>
                    </td>
                    <td>{formatCurrency(worker.payouts?.totalAmount || 0)}</td>
                  </tr>
                ))}
                {!filteredWorkers.length && (
                  <tr>
                    <td colSpan={8} style={{ color: 'var(--text3)' }}>No worker data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedClaim && (
          <div className="admin-modal-backdrop" onClick={() => setSelectedClaim(null)}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-head" style={{ marginBottom: 10 }}>
                <h3>Claim Detail - {selectedClaim.claimId}</h3>
                <button className="btn-outline" onClick={() => setSelectedClaim(null)}>Close</button>
              </div>

              <div className="stat-grid" style={{ marginBottom: 10 }}>
                <div className="stat-box"><span>Worker ID</span><strong style={{ fontSize: 16 }}>{selectedClaim.workerId}</strong></div>
                <div className="stat-box"><span>Fraud Status</span><strong style={{ fontSize: 16 }}>{selectedClaim.fraudStatus}</strong></div>
                <div className="stat-box"><span>Payout Status</span><strong style={{ fontSize: 16 }}>{selectedClaim.payoutStatus}</strong></div>
              </div>

              <div className="card-sm" style={{ marginBottom: 8 }}>
                <span className="muted-label">Fraud Reasons</span>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(selectedClaim.fraudReasons || []).length
                    ? selectedClaim.fraudReasons.map((reason) => <span key={reason} className="pill pill-warn">{reason}</span>)
                    : <span style={{ color: 'var(--text3)' }}>Model indicates low-risk behavior for this claim.</span>}
                </div>
              </div>

              <div className="card-sm" style={{ marginBottom: 8 }}>
                <span className="muted-label">Decision Log</span>
                <p className="muted-copy" style={{ marginTop: 8 }}>{selectedClaim.decisionLog || 'No decision log captured.'}</p>
              </div>

              <div className="card-sm">
                <span className="muted-label">Event Metadata</span>
                <pre style={{ marginTop: 8, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(selectedClaim.eventMeta || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
