import { triggerDisruption, TRIGGER_TYPES } from '../services/triggerService.js';
import {
  getUserClaimTimeline,
  getUserDetailedTimeline,
  runPipelineFromEvent,
} from '../services/claimPipelineService.js';
import { getWeatherMeta } from '../services/weatherService.js';

function parseControllerError(error) {
  if (/required|Unsupported/i.test(error.message)) return 400;
  if (/inactive/i.test(error.message)) return 403;
  return 500;
}

async function respondWithTrigger(res, type, userId, meta) {
  try {
    const event = triggerDisruption(type, userId, meta);
    const { claim, fraudCheck, payout, stages, decisionLog } = await runPipelineFromEvent(event);

    return res.status(200).json({
      success: true,
      event,
      claim,
      fraudCheck,
      payout,
      stages,
      decisionLog,
    });
  } catch (error) {
    const statusCode = parseControllerError(error);

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
}

export async function simulateWeather(req, res) {
  const { userId, rainfall, city } = req.body;

  try {
    const weatherMeta = await getWeatherMeta({ city, rainfall });
    return respondWithTrigger(res, TRIGGER_TYPES.WEATHER, userId, weatherMeta);
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: `Weather API failed: ${error.message}`,
    });
  }
}

export async function simulateDowntime(req, res) {
  const { userId, platform, duration } = req.body;
  return await respondWithTrigger(res, TRIGGER_TYPES.DOWNTIME, userId, {
    platform: platform || 'Unknown Platform',
    duration: Number(duration || 0),
  });
}

export async function simulateStrike(req, res) {
  const { userId, city } = req.body;
  return await respondWithTrigger(res, TRIGGER_TYPES.STRIKE, userId, { city: city || 'Unknown City' });
}

export async function simulateAccident(req, res) {
  const { userId, severity } = req.body;
  return await respondWithTrigger(res, TRIGGER_TYPES.ACCIDENT, userId, { severity: severity || 'low' });
}

export async function simulateAccountBlock(req, res) {
  const { userId, reason } = req.body;
  return await respondWithTrigger(res, TRIGGER_TYPES.ACCOUNT_BLOCK, userId, { reason: reason || 'Security review' });
}

export function listUserSimulations(req, res) {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const timeline = getUserClaimTimeline(userId);
  return res.json({ success: true, ...timeline });
}

export function listUserDetailedTimeline(req, res) {
  const userId = req.query.userId || req.params.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const timeline = getUserDetailedTimeline(userId);
  return res.json({ success: true, userId, ...timeline });
}
