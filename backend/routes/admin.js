import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getSystemStats,
  getFraudAnalytics,
  getPayoutStats,
  getLiveActivityFeed,
  getRiskPrediction,
  getClaimsTable,
  detectAnomalies,
  getWorkersDetails,
} from '../services/adminAnalyticsService.js';
import { getAutoMonitoringStatus, updateMonitoringConfig } from '../services/autoMonitorService.js';
import { getSystemConfig } from '../services/systemConfigService.js';

const router = express.Router();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'payguard123';

function createAdminToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'payguard-secret', { expiresIn: '12h' });
}

function ensureAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Admin token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'payguard-secret');
    if (decoded?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin token' });
  }
}

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const token = createAdminToken();
  return res.json({
    success: true,
    token,
    admin: { username, role: 'admin' },
  });
});

router.use(ensureAdmin);

router.get('/control-center', async (_, res) => {
  try {
    const systemStats = await getSystemStats();
    const fraudAnalytics = getFraudAnalytics();
    const payoutStats = getPayoutStats();
    const liveFeed = getLiveActivityFeed();
    const riskPrediction = getRiskPrediction();
    const claimsTable = getClaimsTable();
    const anomalies = detectAnomalies();
    const monitorStatus = getAutoMonitoringStatus();
    const workersData = await getWorkersDetails();
    res.json({
      success: true,
      systemStats,
      fraudAnalytics,
      payoutStats,
      liveFeed,
      riskPrediction,
      claimsTable,
      anomalies,
      monitorStatus,
      config: getSystemConfig(),
      workersData,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/config', (req, res) => {
  try {
    const updated = updateMonitoringConfig({
      rainThreshold: req.body?.rainThreshold,
      fraudSensitivity: req.body?.fraudSensitivity,
      basePremium: req.body?.basePremium,
      riskMultiplier: req.body?.riskMultiplier,
    });
    res.json({
      success: true,
      monitorStatus: updated,
      config: updated.config,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Backward-compatible aggregate endpoint.
router.get('/analytics', async (_, res) => {
  try {
    const systemStats = await getSystemStats();
    res.json({
      success: true,
      systemStats,
      fraudAnalytics: getFraudAnalytics(),
      payoutStats: getPayoutStats(),
      riskPrediction: getRiskPrediction(),
      claims: getClaimsTable(),
      monitorStatus: getAutoMonitoringStatus(),
      workersData: await getWorkersDetails(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
