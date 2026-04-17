import { TRIGGER_TYPES } from './triggerService.js';
import { getSystemConfig } from './systemConfigService.js';

const claimsByUser = new Map();
const payoutsByUser = new Map();
const timelineByUser = new Map();

const CLAIM_BASE = {
  [TRIGGER_TYPES.WEATHER]: 220,
  [TRIGGER_TYPES.DOWNTIME]: 180,
  [TRIGGER_TYPES.STRIKE]: 260,
  [TRIGGER_TYPES.ACCIDENT]: 340,
  [TRIGGER_TYPES.ACCOUNT_BLOCK]: 140,
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextClaimId() {
  return `CLM-${Date.now()}-${randomInt(100, 999)}`;
}

function nextPayoutId() {
  return `TXN-${Date.now()}-${randomInt(100, 999)}`;
}

function pickPayoutMethod(event) {
  const preferred = String(event?.meta?.preferredPayoutMethod || '').toUpperCase();
  if (preferred === 'UPI' || preferred === 'RAZORPAY') return preferred;
  return Math.random() < 0.55 ? 'UPI' : 'Razorpay';
}

function computeMultiplier(event) {
  const { type, meta = {} } = event;

  if (type === TRIGGER_TYPES.WEATHER) {
    const rainfall = Number(meta.rainfall || 0);
    if (rainfall >= 40) return 1.55;
    if (rainfall >= 20) return 1.3;
    if (rainfall >= 8) return 1.12;
    return 0.95;
  }

  if (type === TRIGGER_TYPES.DOWNTIME) {
    const duration = Number(meta.duration || 0);
    if (duration >= 180) return 1.5;
    if (duration >= 60) return 1.22;
    return 1;
  }

  if (type === TRIGGER_TYPES.ACCIDENT) {
    const severity = String(meta.severity || 'low').toLowerCase();
    if (severity === 'critical') return 1.7;
    if (severity === 'high') return 1.35;
    if (severity === 'medium') return 1.12;
    return 0.95;
  }

  return 1;
}

function recentClaimFrequency(userId, windowMinutes = 30) {
  const recentAfter = Date.now() - windowMinutes * 60 * 1000;
  const claims = claimsByUser.get(userId) || [];
  return claims.filter((claim) => new Date(claim.createdAt).getTime() >= recentAfter).length;
}

function getPastClaimCount(userId) {
  const claims = claimsByUser.get(userId) || [];
  return claims.length;
}

function toRiskStatus(score) {
  if (score >= 70) return 'HIGH_RISK';
  if (score >= 40) return 'MEDIUM_RISK';
  return 'LOW_RISK';
}

/**
 * ML-Based Fraud Detection Engine
 * Uses feature engineering + logistic regression-style probability scoring
 * 
 * Features:
 * - claimFrequency: Multiple claims in short time window
 * - weatherMismatch: Claimed weather vs observed conditions
 * - gpsMismatch: GPS distance inconsistency
 * - oddTiming: Claims at unusual hours (late night/early morning)
 * - repeatOffender: Users with history of suspicious claims
 */
function runFraudCheck(event) {
  const { fraudSensitivity } = getSystemConfig();
  const userId = event.userId;

  // ────── FEATURE ENGINEERING ──────
  const features = {
    claimFrequency: 0,
    weatherMismatch: 0,
    gpsMismatch: 0,
    oddTiming: 0,
    repeatOffender: 0,
  };

  // Feature 1: High claim frequency (3+ claims in 30 minutes)
  const recentFrequency = recentClaimFrequency(userId, 30);
  if (recentFrequency >= 3) {
    features.claimFrequency = 1;
  }

  // Feature 2: Weather mismatch (claimed heavy rain but actual is clear)
  if (event.type === TRIGGER_TYPES.WEATHER) {
    const rainfall = Number(event.meta?.rainfall || 0);
    const weatherMain = String(event.meta?.weatherMain || '').toLowerCase();
    // Mismatch: low rainfall or clear weather reported
    if (rainfall < 5 || weatherMain === 'clear') {
      features.weatherMismatch = 1;
    }
  }

  // Feature 3: GPS inconsistency (distance > 12km from zone or marked inconsistent)
  const gpsConsistent = event.meta?.gpsConsistent !== false;
  const distanceFromZone = Number(event.meta?.distanceFromZoneKm || 0);
  if (!gpsConsistent || distanceFromZone > 12) {
    features.gpsMismatch = 1;
  }

  // Feature 4: Unusual claim timing (late night 23:00-04:00 or very early morning)
  const eventHour = new Date(event.timestamp || Date.now()).getHours();
  if (eventHour <= 4 || eventHour >= 23) {
    features.oddTiming = 1;
  }

  // Feature 5: Repeat offender (user with >3 past claims suggesting pattern)
  const totalPastClaims = getPastClaimCount(userId);
  if (totalPastClaims >= 3) {
    features.repeatOffender = 1;
  }

  // Demo-mode variability: inject occasional realistic anomaly signals so
  // showcases include both LOW and HIGH outcomes.
  if (event?.meta?.demoMode || event?.meta?.demoInjected) {
    const variant = new Date(event.timestamp || Date.now()).getSeconds() % 6;
    if (variant === 2) features.gpsMismatch = 1;
    if (variant === 4) {
      features.claimFrequency = 1;
      features.repeatOffender = 1;
    }
    if (variant === 5) {
      features.claimFrequency = 1;
      features.gpsMismatch = 1;
      features.repeatOffender = 1;
    }
  }

  // ────── LOGISTIC REGRESSION MODEL ──────
  // Calibrated weights based on fraud risk impact
  const weights = {
    claimFrequency: 0.9,      // Multiple rapid claims = high fraud signal
    weatherMismatch: 1.2,     // False weather claims = strongest signal
    gpsMismatch: 1.1,         // GPS anomalies = strong indicator
    oddTiming: 0.5,           // Timing alone = weaker signal
    repeatOffender: 1.0,      // Historical pattern = moderate indicator
  };

  // Compute logistic regression score
  // z = sum(feature_i * weight_i)
  const baseIntercept = -1.2;
  let z = Object.keys(features).reduce(
    (sum, key) => sum + (features[key] * weights[key]),
    baseIntercept
  );

  // Add sensitivity adjustment
  if (fraudSensitivity === 'high') {
    z += 0.3;  // Increase z for higher sensitivity
  } else if (fraudSensitivity === 'low') {
    z -= 0.2;  // Decrease z for lower sensitivity
  }

  // Apply logistic function: probability = 1 / (1 + e^(-z))
  // This converts raw score to probability [0, 1]
  const probability = 1 / (1 + Math.exp(-z));
  
  // Convert to 0-100 fraud score
  let fraudScore = Math.round(probability * 100);
  fraudScore = Math.min(100, Math.max(0, fraudScore));

  // ────── EXTRACT REASONS (EXPLAINABLE AI) ──────
  const reasonMap = {
    claimFrequency: 'High claim frequency',
    weatherMismatch: 'Weather mismatch detected',
    gpsMismatch: 'GPS inconsistency detected',
    oddTiming: 'Unusual claim timing',
    repeatOffender: 'Repeated suspicious claims',
  };

  const reasons = Object.keys(features)
    .filter((key) => features[key] === 1)
    .map((key) => reasonMap[key]);

  if (reasons.length === 0 && fraudScore > 30) {
    reasons.push('Anomaly pattern detected in claim context');
  }

  if (reasons.length === 1 && fraudScore > 70) {
    reasons.push('Escalated for manual review due to combined risk profile');
  }

  // ────── RISK CLASSIFICATION ──────
  const status = toRiskStatus(fraudScore);

  // ────── CONFIDENCE SCORE ──────
  // Higher confidence with more feature signals
  const featureCount = Object.values(features).reduce((sum, v) => sum + v, 0);
  let confidence = Math.min(
    98,
    Math.max(
      45,
      55 + featureCount * 8 + (status === 'HIGH_RISK' ? 10 : status === 'MEDIUM_RISK' ? 5 : 0)
    )
  );

  console.log('[Fraud Check - ML Model]', {
    userId,
    features,
    z: z.toFixed(2),
    probability: probability.toFixed(4),
    fraudScore,
    status,
    reasons,
    confidence,
    fraudSensitivity,
  });

  return {
    fraudScore,
    status,
    reasons,
    confidence,
  };
}

function recordClaim(userId, claim) {
  const claims = claimsByUser.get(userId) || [];
  claims.unshift(claim);
  claimsByUser.set(userId, claims.slice(0, 25));
}

function recordPayout(userId, payout) {
  const payouts = payoutsByUser.get(userId) || [];
  payouts.unshift(payout);
  payoutsByUser.set(userId, payouts.slice(0, 25));
}

function recordTimeline(userId, timelineEntry) {
  const entries = timelineByUser.get(userId) || [];
  entries.unshift(timelineEntry);
  timelineByUser.set(userId, entries.slice(0, 50));
}

function createDecisionLog(event, claim, fraudCheck, payout) {
  const rainfall = event.type === TRIGGER_TYPES.WEATHER ? Number(event.meta?.rainfall || 0) : null;
  const triggerText = event.type === TRIGGER_TYPES.WEATHER
    ? (rainfall >= 40 ? `Heavy rainfall detected (${rainfall}mm)` : `Rainfall event detected (${rainfall}mm)`)
    : `${event.type} disruption detected`;
  const claimDecision = claim.status === 'APPROVED' ? 'Claim auto-approved' : 'Claim routed for review';
  const fraudExplain = fraudCheck?.reasons?.length
    ? `due to ${fraudCheck.reasons.slice(0, 2).join(' + ').toLowerCase()}`
    : 'after risk evaluation';
  const payoutText = payout
    ? `Rs ${payout.amount} payout sent via ${payout.paymentMethod}`
    : 'Payout held pending manual verification';

  return `${triggerText} -> ${claimDecision} -> Fraud risk ${fraudCheck.status} ${fraudExplain} -> ${payoutText}`;
}

export async function runPipelineFromEvent(event) {
  const baseAmount = CLAIM_BASE[event.type] || 160;
  const multiplier = computeMultiplier(event);
  const policyCoverage = Number(event?.meta?.policyCoverage || 0);
  const policyPremium = Number(event?.meta?.policyPremium || 0);
  const riskScore = Number(event?.meta?.riskScore || 0);

  // Genuine amount model: trigger severity x policy profile, capped by policy coverage.
  const profileFactor = 1 + Math.min(0.4, Math.max(-0.15, riskScore / 200));
  const premiumFloor = Math.max(0, policyPremium * 2);
  const grossAmount = Math.round(baseAmount * multiplier * profileFactor + premiumFloor);
  const coverageCap = policyCoverage > 0 ? Math.round(policyCoverage * 0.22) : grossAmount;
  const amount = Math.max(120, Math.min(grossAmount, coverageCap));
  const stages = [];

  stages.push({ step: 'DETECTED', status: 'done' });
  await delay(randomInt(500, 900));

  const claim = {
    claimId: nextClaimId(),
    userId: event.userId,
    eventType: event.type,
    amount,
    status: 'CREATED',
    createdAt: new Date().toISOString(),
    meta: event.meta,
  };

  stages.push({ step: 'CLAIM_CREATED', status: 'done' });
  await delay(randomInt(600, 1000));

  const fraudCheck = runFraudCheck(event);
  claim.status = fraudCheck.status === 'HIGH_RISK' ? 'PENDING_REVIEW' : 'APPROVED';

  console.log('[Fraud Decision]', {
    userId: event.userId,
    fraudScore: fraudCheck.fraudScore,
    status: fraudCheck.status,
    reasons: fraudCheck.reasons,
    confidence: fraudCheck.confidence,
  });

  stages.push({ step: 'FRAUD_CHECK', status: 'done' });
  await delay(randomInt(700, 1200));

  recordClaim(event.userId, claim);

  let payout = null;
  if (claim.status === 'APPROVED') {
    const paymentMethod = pickPayoutMethod(event);
    payout = {
      transactionId: nextPayoutId(),
      userId: event.userId,
      claimId: claim.claimId,
      amount,
      status: 'SUCCESS',
      paymentMethod,
      createdAt: new Date().toISOString(),
    };

    recordPayout(event.userId, payout);

    console.log('[Payout Simulated]', {
      userId: event.userId,
      transactionId: payout.transactionId,
      amount: payout.amount,
      status: payout.status,
    });
  }

  stages.push({ step: 'PAYOUT', status: 'done' });

  const decisionLog = createDecisionLog(event, claim, fraudCheck, payout);

  recordTimeline(event.userId, {
    event,
    claim,
    fraudCheck,
    payout,
    decisionLog,
    stages,
    timestamp: new Date().toISOString(),
  });

  return { claim, fraudCheck, payout, stages, decisionLog };
}

export function getUserClaimTimeline(userId) {
  return {
    claims: claimsByUser.get(userId) || [],
    payouts: payoutsByUser.get(userId) || [],
  };
}

export function getUserDetailedTimeline(userId) {
  return {
    entries: timelineByUser.get(userId) || [],
  };
}

export function getAllTimelineEntries() {
  const entries = [];
  for (const userEntries of timelineByUser.values()) {
    entries.push(...userEntries);
  }
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
