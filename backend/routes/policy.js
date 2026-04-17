import express from 'express';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { triggerDisruption, TRIGGER_TYPES } from '../services/triggerService.js';
import { getUserClaimTimeline, getUserDetailedTimeline, runPipelineFromEvent } from '../services/claimPipelineService.js';
import { getWeatherMeta } from '../services/weatherService.js';
import { calculatePremium } from '../services/premiumEngineService.js';
import { getSystemConfig } from '../services/systemConfigService.js';

const router = express.Router();

const PLANS = {
  starter: { price: 29, coverage: 2000, triggers: 3 },
  pro:     { price: 59, coverage: 5000, triggers: 5 },
  max:     { price: 99, coverage: 10000, triggers: 7 },
};

const TRIGGER_TYPE_MAP = {
  weather: TRIGGER_TYPES.WEATHER,
  WEATHER: TRIGGER_TYPES.WEATHER,
  downtime: TRIGGER_TYPES.DOWNTIME,
  DOWNTIME: TRIGGER_TYPES.DOWNTIME,
  strike: TRIGGER_TYPES.STRIKE,
  STRIKE: TRIGGER_TYPES.STRIKE,
  accident: TRIGGER_TYPES.ACCIDENT,
  ACCIDENT: TRIGGER_TYPES.ACCIDENT,
  account_block: TRIGGER_TYPES.ACCOUNT_BLOCK,
  accountBlock: TRIGGER_TYPES.ACCOUNT_BLOCK,
  ACCOUNT_BLOCK: TRIGGER_TYPES.ACCOUNT_BLOCK,
};

function formatDate(input, locale = 'en-IN', options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(locale, options).format(input);
}

function normalizeTriggerName(type) {
  return String(type || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
}

function scoreToRiskLevel(score) {
  const value = Number(score || 0);
  if (value >= 70) return 'HIGH';
  if (value >= 40) return 'MEDIUM';
  return 'LOW';
}

function zoneScoreToRiskLevel(score) {
  const value = Number(score || 0);
  if (value >= 40) return 'HIGH';
  if (value >= 20) return 'MEDIUM';
  return 'LOW';
}

function deriveRealtimePremium({
  user,
  weatherMeta,
  claimHistoryCount,
  avgFraudScore,
  mode,
  manual = {},
}) {
  const config = getSystemConfig();
  const plan = user.policy?.plan || 'pro';
  const planBase = PLANS[plan]?.price || 59;
  const configuredBase = Number(config.basePremium || planBase);
  const basePremium = mode === 'manual'
    ? Number(manual.basePremium || configuredBase)
    : configuredBase;

  const rainfall = mode === 'manual'
    ? Number(manual.rainfall || 0)
    : Number(weatherMeta?.rainfall || 0);

  const zoneRisk = mode === 'manual'
    ? String(manual.zoneRisk || zoneScoreToRiskLevel(user.zone?.riskScore)).toUpperCase()
    : zoneScoreToRiskLevel(user.zone?.riskScore);

  const riskLevel = mode === 'manual'
    ? String(manual.riskLevel || scoreToRiskLevel(avgFraudScore)).toUpperCase()
    : scoreToRiskLevel(avgFraudScore);

  const premiumResult = calculatePremium({
    basePremium,
    rainfall,
    riskLevel,
    zoneRisk,
    claimHistoryCount: mode === 'manual' ? Number(manual.claimHistoryCount || 0) : claimHistoryCount,
    fraudScore: mode === 'manual' ? Number(manual.fraudScore || 0) : avgFraudScore,
    riskMultiplier: Number(config.riskMultiplier || 1),
    demoMode: String(process.env.DEMO_MODE || 'true').toLowerCase() !== 'false',
  });

  const findAdj = (label) => premiumResult.breakdown.find((item) => item.label === label)?.value || 0;

  return {
    base: premiumResult.inputs.basePremium,
    zoneAdj: findAdj('Zone Adjustment'),
    weatherAdj: findAdj('Rainfall Risk'),
    platformAdj: 0,
    loyaltyAdj: findAdj('Safe Driver Bonus'),
    final: premiumResult.finalPremium,
    savings: Math.max(0, premiumResult.inputs.basePremium - premiumResult.finalPremium),
    weather: {
      city: weatherMeta?.city || user.zone?.city || 'Unknown',
      rainfall: premiumResult.inputs.rainfall,
      source: weatherMeta?.source || 'manual',
      weatherMain: weatherMeta?.weatherMain || 'Unknown',
      weatherDescription: weatherMeta?.weatherDescription || 'unknown',
    },
    riskLevel: premiumResult.riskLevel,
    riskScore: Math.round((premiumResult.inputs.fraudScore * 0.7) + (premiumResult.inputs.rainfall * 0.3)),
    explanation: 'Premium adjusted based on rainfall risk and zone activity',
    breakdown: premiumResult.breakdown,
    claimHistoryCount: premiumResult.inputs.claimHistoryCount,
    fraudScore: premiumResult.inputs.fraudScore,
    calculationMode: mode,
    config: {
      basePremium: Number(config.basePremium || planBase),
      rainThreshold: Number(config.rainThreshold || 60),
      riskMultiplier: Number(config.riskMultiplier || 1),
      fraudSensitivity: String(config.fraudSensitivity || 'medium'),
    },
  };
}

function deriveFraudStatus(avgFraudScore) {
  if (avgFraudScore >= 70) return 'Elevated';
  if (avgFraudScore >= 40) return 'Review';
  return 'Safe';
}

// POST /api/policy/activate
router.post('/activate', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ success: false, message: 'Invalid plan' });

    const renewsAt = new Date();
    renewsAt.setDate(renewsAt.getDate() + 7);

    const user = await User.findByIdAndUpdate(req.user._id, {
      'policy.plan': plan,
      'policy.status': 'active',
      'policy.premium': PLANS[plan].price,
      'policy.coverage': PLANS[plan].coverage,
      'policy.activatedAt': new Date(),
      'policy.renewsAt': renewsAt,
    }, { new: true });

    res.json({ success: true, policy: user.policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/policy/toggle
router.patch('/toggle', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const newStatus = user.policy.status === 'active' ? 'paused' : 'active';
    user.policy.status = newStatus;
    await user.save();
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/policy/premium-calc
router.get('/premium-calc', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const weather = await getWeatherMeta({ city: user.zone?.city, rainfall: Number(req.query.rainfall || 0) });
    const mode = String(req.query.mode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const timeline = getUserDetailedTimeline(String(user._id));
    const entries = timeline?.entries || [];
    const claimHistoryCount = entries.length;
    const avgFraudScore = entries.length
      ? Number((entries.reduce((sum, entry) => sum + Number(entry?.fraudCheck?.fraudScore || 0), 0) / entries.length).toFixed(1))
      : Number(user.zone?.riskScore || 25);

    const premium = deriveRealtimePremium({
      user,
      weatherMeta: weather,
      claimHistoryCount,
      avgFraudScore,
      mode,
      manual: {
        basePremium: req.query.basePremium,
        rainfall: req.query.rainfall,
        riskLevel: req.query.riskLevel,
        zoneRisk: req.query.zoneRisk,
        claimHistoryCount: req.query.claimHistoryCount,
        fraudScore: req.query.fraudScore,
      },
    });

    res.json({
      success: true,
      ...premium,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/policy/dashboard
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user?.policy?.plan) {
      return res.status(400).json({ success: false, message: 'No active policy' });
    }

    const { claims: rawClaims, payouts: rawPayouts } = getUserClaimTimeline(String(user._id));
    const { entries } = getUserDetailedTimeline(String(user._id));

    const claims = (entries || []).map((entry) => ({
      claimId: entry?.claim?.claimId,
      eventType: normalizeTriggerName(entry?.event?.type),
      status: entry?.claim?.status === 'APPROVED' ? 'Approved' : entry?.claim?.status === 'PENDING_REVIEW' ? 'Pending' : 'Rejected',
      amount: Number(entry?.claim?.amount || 0),
      date: formatDate(new Date(entry?.claim?.createdAt || entry?.timestamp || Date.now())),
    }));

    const payouts = (rawPayouts || []).map((payout) => ({
      transactionId: payout.transactionId,
      amount: Number(payout.amount || 0),
      date: formatDate(new Date(payout.createdAt || Date.now())),
      paymentMethod: payout.paymentMethod || 'UPI',
      status: payout.status === 'QUEUED' ? 'Processing' : 'Settled',
    }));

    const approvedClaims = (rawClaims || []).filter((claim) => claim.status === 'APPROVED');
    const totalProtected = approvedClaims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
    const weeklyLimit = Math.max(1000, Math.round((user.policy.coverage || 0) / 5));

    const fraudAvg = (entries || []).length
      ? Math.round((entries.reduce((acc, entry) => acc + Number(entry?.fraudCheck?.fraudScore || 0), 0) / entries.length))
      : Math.max(4, Math.min(26, Math.round(Number(user.zone?.riskScore || 15) / 2.5)));

    res.json({
      success: true,
      coverage: {
        policyId: `PG${String(user._id).slice(-4).toUpperCase()}`,
        coverageAmount: user.policy.coverage || 0,
        premiumPaid: user.policy.premium || 0,
        startDate: user.policy.activatedAt ? formatDate(new Date(user.policy.activatedAt)) : 'Not started',
        expiryDate: user.policy.renewsAt ? formatDate(new Date(user.policy.renewsAt), 'en-IN', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'Not scheduled',
        status: user.policy.status === 'active' ? 'Active' : 'Expired',
      },
      protection: {
        totalEarningsProtected: totalProtected,
        weeklyCoverageLimit: weeklyLimit,
      },
      fraud: {
        riskScore: fraudAvg,
        status: deriveFraudStatus(fraudAvg),
      },
      claims,
      payouts,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/policy/claim
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { triggerType, city, rainfall, platform, duration, severity, reason } = req.body;
    const user = await User.findById(req.user._id);
    if (!user.policy?.plan) return res.status(400).json({ success: false, message: 'No active policy' });

    const resolvedType = TRIGGER_TYPE_MAP[triggerType] || TRIGGER_TYPES.WEATHER;
    const weather = await getWeatherMeta({ city: city || user.zone?.city, rainfall: Number(rainfall || 0) });

    const eventMeta = {
      ...weather,
      city: city || user.zone?.city || weather?.city,
      platform: platform || 'Unknown Platform',
      duration: Number(duration || 0),
      severity: severity || 'medium',
      reason: reason || 'User-triggered claim',
      policyCoverage: Number(user.policy?.coverage || 0),
      policyPremium: Number(user.policy?.premium || 0),
      riskScore: Number(user.zone?.riskScore || 0),
      linkedPlatforms: user.platform?.linked?.length || 0,
      gpsConsistent: user.zone?.lat != null && user.zone?.lng != null,
      autoMonitored: false,
    };

    const event = triggerDisruption(resolvedType, String(user._id), eventMeta);
    const pipeline = await runPipelineFromEvent(event);

    res.json({
      success: true,
      event,
      ...pipeline,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
