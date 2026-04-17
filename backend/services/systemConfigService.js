const systemConfig = {
  rainThreshold: 60,
  fraudSensitivity: 'medium',
  basePremium: 59,
  riskMultiplier: 1,
};

const SENSITIVITY = new Set(['low', 'medium', 'high']);

export function getSystemConfig() {
  return { ...systemConfig };
}

export function updateSystemConfig(input = {}) {
  if (input.rainThreshold != null) {
    const threshold = Number(input.rainThreshold);
    if (!Number.isNaN(threshold) && threshold >= 1) {
      systemConfig.rainThreshold = Math.min(200, threshold);
    }
  }

  if (input.fraudSensitivity != null) {
    const normalized = String(input.fraudSensitivity).toLowerCase();
    if (SENSITIVITY.has(normalized)) {
      systemConfig.fraudSensitivity = normalized;
    }
  }

  if (input.basePremium != null) {
    const value = Number(input.basePremium);
    if (!Number.isNaN(value) && value >= 20) {
      systemConfig.basePremium = Math.min(300, Math.round(value));
    }
  }

  if (input.riskMultiplier != null) {
    const value = Number(input.riskMultiplier);
    if (!Number.isNaN(value) && value >= 0.5) {
      systemConfig.riskMultiplier = Math.min(3, Number(value.toFixed(2)));
    }
  }

  return getSystemConfig();
}
