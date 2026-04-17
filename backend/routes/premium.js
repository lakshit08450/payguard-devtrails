import express from 'express';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { getUserDetailedTimeline } from '../services/claimPipelineService.js';
import { getWeatherMeta } from '../services/weatherService.js';
import { calculatePremium } from '../services/premiumEngineService.js';
import { getSystemConfig } from '../services/systemConfigService.js';

const router = express.Router();

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

router.get('/calculate', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const config = getSystemConfig();
    const weather = await getWeatherMeta({ city: user?.zone?.city, rainfall: Number(req.query.rainfall || 0) });

    const timeline = getUserDetailedTimeline(String(user._id));
    const entries = timeline?.entries || [];

    const mode = String(req.query.mode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const claimHistoryCount = mode === 'manual'
      ? Number(req.query.claimHistoryCount || 0)
      : entries.length;

    const avgFraudScore = mode === 'manual'
      ? Number(req.query.fraudScore || 0)
      : (entries.length
        ? Number((entries.reduce((sum, entry) => sum + Number(entry?.fraudCheck?.fraudScore || 0), 0) / entries.length).toFixed(1))
        : Number(user?.zone?.riskScore || 25));

    const result = calculatePremium({
      basePremium: mode === 'manual' ? Number(req.query.basePremium || config.basePremium || 59) : Number(config.basePremium || 59),
      rainfall: mode === 'manual' ? Number(req.query.rainfall || 0) : Number(weather?.rainfall || 0),
      riskLevel: mode === 'manual' ? String(req.query.riskLevel || scoreToRiskLevel(avgFraudScore)) : scoreToRiskLevel(avgFraudScore),
      zoneRisk: mode === 'manual' ? String(req.query.zoneRisk || zoneScoreToRiskLevel(user?.zone?.riskScore)) : zoneScoreToRiskLevel(user?.zone?.riskScore),
      claimHistoryCount,
      fraudScore: avgFraudScore,
      riskMultiplier: Number(config.riskMultiplier || 1),
      demoMode: String(process.env.DEMO_MODE || 'true').toLowerCase() !== 'false',
    });

    return res.json({
      success: true,
      finalPremium: result.finalPremium,
      breakdown: result.breakdown,
      riskLevel: result.riskLevel,
      mode,
      weather: {
        city: weather?.city || user?.zone?.city || 'Unknown',
        rainfall: result.inputs.rainfall,
        source: weather?.source || 'manual',
      },
      inputs: result.inputs,
      config: {
        basePremium: Number(config.basePremium || 59),
        rainThreshold: Number(config.rainThreshold || 60),
        riskMultiplier: Number(config.riskMultiplier || 1),
        fraudSensitivity: String(config.fraudSensitivity || 'medium'),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
