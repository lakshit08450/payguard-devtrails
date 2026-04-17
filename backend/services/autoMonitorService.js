import { triggerDisruption, TRIGGER_TYPES } from './triggerService.js';
import { runPipelineFromEvent } from './claimPipelineService.js';
import { getWeatherMeta } from './weatherService.js';
import { getSystemConfig, updateSystemConfig } from './systemConfigService.js';

const DEMO_MODE = String(process.env.DEMO_MODE || 'true').toLowerCase() !== 'false';

const monitorState = {
  isMonitoring: false,
  timer: null,
  intervalMs: 45000,
  rainfallThreshold: getSystemConfig().rainThreshold,
  cooldownMs: 300000,
  users: new Map(),
};

const monitorListeners = new Set();

function emitMonitorEvent(payload) {
  monitorListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      console.error('[AutoMonitor] listener error', error.message);
    }
  });
}

function clampInterval(seconds) {
  const safe = Number(seconds || 45);
  return Math.min(60, Math.max(30, safe)) * 1000;
}

function upsertUser(config) {
  const userId = config.userId || 'demo-worker-001';

  const previous = monitorState.users.get(userId) || {};
  const currentConfig = getSystemConfig();
  monitorState.users.set(userId, {
    userId,
    city: config.city || previous.city || 'Mumbai',
    cooldownMs: Number(config.cooldownMs || previous.cooldownMs || monitorState.cooldownMs),
    rainfallThreshold: Number(config.rainfallThreshold || previous.rainfallThreshold || currentConfig.rainThreshold || monitorState.rainfallThreshold),
    lastTriggeredAt: previous.lastTriggeredAt || 0,
    lastObservedRainfall: previous.lastObservedRainfall || 0,
    lastCheckedAt: previous.lastCheckedAt || null,
  });
}

function shouldSkipForCooldown(userConfig) {
  const now = Date.now();
  return now - Number(userConfig.lastTriggeredAt || 0) < Number(userConfig.cooldownMs || monitorState.cooldownMs);
}

function getEffectiveRainfall(rawRainfall = 0) {
  const numericRaw = Number(rawRainfall || 0);

  if (!DEMO_MODE) {
    return { rainfall: numericRaw, demoInjected: false };
  }

  if (numericRaw > 10) {
    const boosted = Math.random() < 0.2
      ? Math.min(120, numericRaw + Math.random() * 30)
      : numericRaw;

    return { rainfall: Number(boosted.toFixed(2)), demoInjected: boosted !== numericRaw };
  }

  // Demo-friendly behavior: inject rainfall variability when API reports no/low rain.
  const synthetic = Math.random() < 0.7
    ? 60 + Math.random() * 45
    : Math.random() * 59;

  return { rainfall: Number(synthetic.toFixed(2)), demoInjected: true };
}

async function evaluateUserWeather(userConfig) {
  const weather = await getWeatherMeta({ city: userConfig.city });
  const rawRainfall = Number(weather?.rainfall || 0);
  const { rainfall: effectiveRainfall, demoInjected } = getEffectiveRainfall(rawRainfall);

  console.log('[AutoMonitor] Auto monitoring running...', {
    userId: userConfig.userId,
    city: userConfig.city,
    demoMode: DEMO_MODE,
  });
  console.log('[AutoMonitor] Rainfall detected:', {
    rawRainfall,
    effectiveRainfall,
    unit: 'mm',
    demoInjected,
  });

  userConfig.lastCheckedAt = new Date().toISOString();
  userConfig.lastObservedRainfall = effectiveRainfall;

  if (effectiveRainfall <= Number(userConfig.rainfallThreshold)) {
    console.log('[AutoMonitor] No trigger - rainfall below threshold', {
      userId: userConfig.userId,
      rainfall: effectiveRainfall,
      threshold: userConfig.rainfallThreshold,
    });
    return { triggered: false, reason: 'below-threshold', weather };
  }

  if (shouldSkipForCooldown(userConfig)) {
    console.log('[AutoMonitor] No trigger - cooldown active', {
      userId: userConfig.userId,
      cooldownMs: userConfig.cooldownMs,
    });
    return { triggered: false, reason: 'cooldown-active', weather };
  }

  const event = triggerDisruption(TRIGGER_TYPES.WEATHER, userConfig.userId, {
    ...weather,
    rawRainfall,
    rainfall: effectiveRainfall,
    demoMode: DEMO_MODE,
    demoInjected,
    autoMonitored: true,
    threshold: userConfig.rainfallThreshold,
  });

  const pipeline = await runPipelineFromEvent(event);
  userConfig.lastTriggeredAt = Date.now();

  console.log('[AutoMonitor] Auto trigger fired', {
    userId: userConfig.userId,
    city: userConfig.city,
    rainfall: effectiveRainfall,
    claimId: pipeline.claim?.claimId,
  });

  emitMonitorEvent({
    type: 'AUTO_TRIGGERED',
    userId: userConfig.userId,
    city: userConfig.city,
    rainfall: effectiveRainfall,
    rawRainfall,
    demoMode: DEMO_MODE,
    demoInjected,
    event,
    ...pipeline,
    timestamp: new Date().toISOString(),
  });

  return { triggered: true, event, ...pipeline };
}

async function monitorCycle() {
  const users = [...monitorState.users.values()];
  if (!users.length) return;

  const results = await Promise.allSettled(users.map((user) => evaluateUserWeather(user)));

  results.forEach((result, index) => {
    const user = users[index];
    if (result.status === 'fulfilled' && result.value.triggered) {
      console.log('[AutoMonitor] Triggered weather pipeline', {
        userId: user.userId,
        city: user.city,
        rainfall: result.value.event?.meta?.rainfall,
      });
      return;
    }

    if (result.status === 'rejected') {
      console.error('[AutoMonitor] cycle error', {
        userId: user.userId,
        message: result.reason?.message,
      });
    }
  });
}

function ensureRunning() {
  if (monitorState.timer) return;
  monitorState.timer = setInterval(() => {
    monitorCycle().catch((error) => {
      console.error('[AutoMonitor] unexpected cycle failure', error.message);
    });
  }, monitorState.intervalMs);
}

export function startAutoMonitoring(config = {}) {
  if (config.rainfallThreshold != null) {
    updateSystemConfig({ rainThreshold: config.rainfallThreshold });
  }

  upsertUser(config);
  monitorState.intervalMs = clampInterval(config.intervalSec || monitorState.intervalMs / 1000);

  if (monitorState.timer) {
    clearInterval(monitorState.timer);
    monitorState.timer = null;
  }

  monitorState.isMonitoring = true;
  ensureRunning();
  monitorCycle().catch((error) => {
    console.error('[AutoMonitor] initial cycle error', error.message);
  });

  console.log('[AutoMonitor] Started', {
    users: monitorState.users.size,
    intervalMs: monitorState.intervalMs,
  });

  return getAutoMonitoringStatus();
}

export function stopAutoMonitoring(userId) {
  if (userId) {
    monitorState.users.delete(userId);
  } else {
    monitorState.users.clear();
  }

  if (!monitorState.users.size && monitorState.timer) {
    clearInterval(monitorState.timer);
    monitorState.timer = null;
  }

  monitorState.isMonitoring = Boolean(monitorState.users.size);

  console.log('[AutoMonitor] Stopped', { userId: userId || 'all' });

  return getAutoMonitoringStatus();
}

export function getAutoMonitoringStatus() {
  return {
    isMonitoring: monitorState.isMonitoring,
    demoMode: DEMO_MODE,
    intervalMs: monitorState.intervalMs,
    config: getSystemConfig(),
    users: [...monitorState.users.values()].map((user) => ({
      userId: user.userId,
      city: user.city,
      rainfallThreshold: user.rainfallThreshold,
      cooldownMs: user.cooldownMs,
      lastTriggeredAt: user.lastTriggeredAt ? new Date(user.lastTriggeredAt).toISOString() : null,
      lastCheckedAt: user.lastCheckedAt,
      lastObservedRainfall: user.lastObservedRainfall,
    })),
  };
}

export function subscribeToMonitorEvents(listener) {
  monitorListeners.add(listener);
  return () => monitorListeners.delete(listener);
}

export function updateMonitoringConfig(input = {}) {
  const nextConfig = updateSystemConfig({
    rainThreshold: input.rainThreshold,
    fraudSensitivity: input.fraudSensitivity,
    basePremium: input.basePremium,
    riskMultiplier: input.riskMultiplier,
  });

  if (input.rainThreshold != null) {
    for (const user of monitorState.users.values()) {
      user.rainfallThreshold = Number(nextConfig.rainThreshold);
    }
  }

  return {
    ...getAutoMonitoringStatus(),
    config: nextConfig,
  };
}
