const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRiskLevel(value, fallback = 'LOW') {
  const normalized = String(value || fallback).toUpperCase();
  return RISK_LEVELS.includes(normalized) ? normalized : fallback;
}

function riskRank(level) {
  return RISK_LEVELS.indexOf(normalizeRiskLevel(level));
}

function maxRiskLevel(...levels) {
  return levels
    .map((level) => normalizeRiskLevel(level, 'LOW'))
    .sort((a, b) => riskRank(b) - riskRank(a))[0] || 'LOW';
}

export function calculatePremium(data = {}) {
  const basePremium = Math.max(29, Math.round(toNumber(data.basePremium, 59)));
  const riskMultiplier = Math.max(0.5, Math.min(3, toNumber(data.riskMultiplier, 1)));
  const claimHistoryCount = Math.max(0, Math.round(toNumber(data.claimHistoryCount, 0)));
  const fraudScore = Math.max(0, Math.min(100, Math.round(toNumber(data.fraudScore, 0))));
  const demoMode = Boolean(data.demoMode);

  let rainfall = Math.max(0, toNumber(data.rainfall, 0));
  if (demoMode && rainfall <= 0) {
    rainfall = Number((Math.random() * 130).toFixed(1));
  }

  const baseRiskLevel = normalizeRiskLevel(data.riskLevel, 'LOW');
  const zoneRisk = normalizeRiskLevel(data.zoneRisk, 'LOW');

  let total = basePremium;
  const breakdown = [];

  const addAdjustment = (label, rawValue) => {
    const value = Math.round(rawValue * riskMultiplier);
    if (!value) return;
    total += value;
    breakdown.push({ label, value });
  };

  if (rainfall > 100) addAdjustment('Rainfall Risk', 20);
  else if (rainfall > 60) addAdjustment('Rainfall Risk', 10);

  if (baseRiskLevel === 'MEDIUM') addAdjustment('Risk Level Adjustment', 5);
  if (baseRiskLevel === 'HIGH') addAdjustment('Risk Level Adjustment', 15);

  if (zoneRisk === 'MEDIUM') addAdjustment('Zone Adjustment', 5);
  if (zoneRisk === 'HIGH') addAdjustment('Zone Adjustment', 10);

  if (claimHistoryCount > 3) addAdjustment('Claim Frequency Adjustment', 10);
  if (fraudScore > 70) addAdjustment('Fraud Exposure Adjustment', 15);

  if (claimHistoryCount <= 1 && fraudScore < 35) {
    addAdjustment('Safe Driver Bonus', -3);
  }

  const inferredRiskFromFraud = fraudScore > 70 ? 'HIGH' : fraudScore >= 40 ? 'MEDIUM' : 'LOW';
  const inferredRiskFromClaims = claimHistoryCount > 3 ? 'HIGH' : claimHistoryCount > 1 ? 'MEDIUM' : 'LOW';
  const effectiveRiskLevel = maxRiskLevel(baseRiskLevel, zoneRisk, inferredRiskFromFraud, inferredRiskFromClaims);

  const finalPremium = Math.max(29, Math.round(total));

  return {
    finalPremium,
    breakdown,
    riskLevel: effectiveRiskLevel,
    inputs: {
      basePremium,
      rainfall,
      riskLevel: baseRiskLevel,
      zoneRisk,
      claimHistoryCount,
      fraudScore,
      riskMultiplier,
    },
  };
}
