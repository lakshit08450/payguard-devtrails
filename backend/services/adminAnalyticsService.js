import User from '../models/User.js';
import { getAllTimelineEntries } from './claimPipelineService.js';
import { getAutoMonitoringStatus } from './autoMonitorService.js';

function isToday(ts) {
  const now = new Date();
  const date = new Date(ts);
  return date.getDate() === now.getDate()
    && date.getMonth() === now.getMonth()
    && date.getFullYear() === now.getFullYear();
}

function sum(arr, selector) {
  return arr.reduce((acc, item) => acc + Number(selector(item) || 0), 0);
}

function statusLabel(entry) {
  if (!entry?.payout) return 'Blocked';
  return 'Approved';
}

export async function getSystemStats() {
  const entries = getAllTimelineEntries();
  const totalClaims = entries.length;
  const autoTriggeredClaims = entries.filter((entry) => entry?.event?.meta?.autoMonitored).length;
  const highRisk = entries.filter((entry) => entry?.fraudCheck?.status === 'HIGH_RISK').length;
  const fraudRate = totalClaims ? Number(((highRisk / totalClaims) * 100).toFixed(1)) : 0;
  const totalPayoutAmount = sum(entries.filter((entry) => entry?.payout), (entry) => entry.payout.amount);
  const totalUsers = await User.countDocuments();
  const activePolicies = Math.max(autoTriggeredClaims, Math.round(totalUsers * 0.72));

  return {
    totalClaims,
    autoTriggeredClaims,
    fraudRate,
    totalPayoutAmount,
    activePolicies,
  };
}

export function getFraudAnalytics() {
  const entries = getAllTimelineEntries();
  const scores = entries.map((entry) => Number(entry?.fraudCheck?.fraudScore || 0));
  const averageFraudScore = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;

  const reasonsBreakdown = {
    'GPS mismatch': 0,
    'High frequency': 0,
    'Timing anomaly': 0,
  };

  let highRiskClaims = 0;
  for (const entry of entries) {
    if (entry?.fraudCheck?.status === 'HIGH_RISK') highRiskClaims += 1;

    const reasons = entry?.fraudCheck?.reasons || [];
    if (reasons.some((reason) => /GPS inconsistency/i.test(reason))) reasonsBreakdown['GPS mismatch'] += 1;
    if (reasons.some((reason) => /High claim frequency/i.test(reason))) reasonsBreakdown['High frequency'] += 1;
    if (reasons.some((reason) => /Unusual timing/i.test(reason))) reasonsBreakdown['Timing anomaly'] += 1;
  }

  return {
    averageFraudScore,
    highRiskClaims,
    reasonsBreakdown,
  };
}

export function getPayoutStats() {
  const entries = getAllTimelineEntries();
  const todayEntries = entries.filter((entry) => isToday(entry.timestamp));
  const todayPayouts = todayEntries.filter((entry) => entry?.payout);
  const blockedPayouts = todayEntries.filter((entry) => !entry?.payout);

  const totalPayoutToday = sum(todayPayouts, (entry) => entry.payout.amount);
  const averagePayout = todayPayouts.length ? Number((totalPayoutToday / todayPayouts.length).toFixed(1)) : 0;

  return {
    totalPayoutToday,
    averagePayout,
    approvedPayouts: todayPayouts.length,
    blockedPayouts: blockedPayouts.length,
  };
}

export function getLiveActivityFeed(limit = 25) {
  const entries = getAllTimelineEntries().slice(0, limit);

  return entries.flatMap((entry) => {
    const time = new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const activity = [`[${time}] ${entry?.event?.meta?.autoMonitored ? 'Auto Claim Triggered' : 'Manual Claim Triggered'} (${entry?.event?.type || 'Unknown'})`];
    activity.push(`[${time}] Fraud Check: ${entry?.fraudCheck?.status || 'UNKNOWN'}`);
    activity.push(`[${time}] ${entry?.payout ? `Rs ${entry.payout.amount} Payout Processed` : 'Payout Blocked'}`);
    return activity;
  });
}

export function getRiskPrediction() {
  const status = getAutoMonitoringStatus();
  const latest = status.users?.[0];
  const currentRainfall = Number(latest?.lastObservedRainfall || 0);
  const threshold = Number(latest?.rainfallThreshold || status?.config?.rainThreshold || 60);

  let nextRiskLevel = 'LOW';
  if (currentRainfall >= threshold) nextRiskLevel = 'HIGH';
  else if (currentRainfall >= threshold * 0.6) nextRiskLevel = 'MEDIUM';

  const expectedClaims = nextRiskLevel === 'HIGH' ? 8 : nextRiskLevel === 'MEDIUM' ? 4 : 1;

  return {
    currentRainfall,
    threshold,
    nextRiskLevel,
    expectedClaims,
  };
}

export function getClaimsTable(limit = 40) {
  const entries = getAllTimelineEntries().slice(0, limit);

  return entries.map((entry) => ({
    claimId: entry?.claim?.claimId,
    type: entry?.event?.type,
    fraudScore: entry?.fraudCheck?.fraudScore,
    status: statusLabel(entry),
    payoutAmount: entry?.payout?.amount || 0,
    source: entry?.event?.meta?.autoMonitored ? 'Auto' : 'Manual',
    timestamp: entry?.timestamp,
  }));
}

export function detectAnomalies() {
  const entries = getAllTimelineEntries();
  const now = Date.now();
  const lastTwoMin = entries.filter((entry) => now - new Date(entry.timestamp).getTime() <= 2 * 60 * 1000);

  const anomalies = [];
  if (lastTwoMin.length >= 5) {
    anomalies.push(`Spike detected: ${lastTwoMin.length} claims in 2 minutes`);
  }

  const highRiskBurst = lastTwoMin.filter((entry) => entry?.fraudCheck?.status === 'HIGH_RISK').length;
  if (highRiskBurst >= 2) {
    anomalies.push(`Multiple high-risk claims detected (${highRiskBurst})`);
  }

  return anomalies;
}

export async function getWorkersDetails(limit = 250) {
  const [users, entries] = await Promise.all([
    User.find(),
    Promise.resolve(getAllTimelineEntries()),
  ]);

  const monitorStatus = getAutoMonitoringStatus();
  const monitorByUser = new Map((monitorStatus.users || []).map((item) => [String(item.userId), item]));

  const entryByUser = new Map();
  for (const entry of entries) {
    const userKey = String(entry?.claim?.userId ?? entry?.event?.userId ?? '');
    if (!userKey) continue;
    const bucket = entryByUser.get(userKey) || [];
    bucket.push(entry);
    entryByUser.set(userKey, bucket);
  }

  return users.slice(0, limit).map((user) => {
    const userKey = String(user._id);
    const workerEntries = entryByUser.get(userKey) || [];
    const approvedClaims = workerEntries.filter((entry) => entry?.claim?.status === 'APPROVED').length;
    const blockedClaims = workerEntries.filter((entry) => entry?.claim?.status !== 'APPROVED').length;
    const totalPayoutAmount = sum(workerEntries.filter((entry) => entry?.payout), (entry) => entry?.payout?.amount);
    const latestEntry = workerEntries[0];
    const monitor = monitorByUser.get(userKey);

    return {
      workerId: user._id,
      name: user.name || '-',
      phone: user.phone || '-',
      email: user.email || '-',
      phoneVerified: Boolean(user.isPhoneVerified),
      kycVerified: Boolean(user.isKycVerified),
      aadhaarLast4: user.kyc?.aadhaarLast4 || '-',
      platforms: user.platform?.linked || [],
      policyPlan: user.policy?.plan || '-',
      policyStatus: user.policy?.status || '-',
      premium: Number(user.policy?.premium || 0),
      coverage: Number(user.policy?.coverage || 0),
      city: user.zone?.city || '-',
      area: user.zone?.area || '-',
      riskScore: Number(user.zone?.riskScore || 0),
      gps: {
        lat: user.zone?.lat ?? null,
        lng: user.zone?.lng ?? null,
        accuracy: user.zone?.accuracy ?? null,
        speed: user.zone?.speed ?? null,
        heading: user.zone?.heading ?? null,
        lastGpsAt: user.zone?.lastGpsAt ?? null,
      },
      monitor: {
        active: Boolean(monitorStatus.isMonitoring && monitor),
        lastCheckedAt: monitor?.lastCheckedAt || null,
        lastTriggeredAt: monitor?.lastTriggeredAt || null,
        lastObservedRainfall: Number(monitor?.lastObservedRainfall || 0),
      },
      claims: {
        total: workerEntries.length,
        approved: approvedClaims,
        blocked: blockedClaims,
        latestFraudStatus: latestEntry?.fraudCheck?.status || 'NONE',
        latestFraudScore: Number(latestEntry?.fraudCheck?.fraudScore || 0),
      },
      payouts: {
        totalAmount: totalPayoutAmount,
      },
      createdAt: user.createdAt,
    };
  });
}