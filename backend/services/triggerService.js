export const TRIGGER_TYPES = Object.freeze({
  WEATHER: 'WEATHER',
  DOWNTIME: 'DOWNTIME',
  STRIKE: 'STRIKE',
  ACCIDENT: 'ACCIDENT',
  ACCOUNT_BLOCK: 'ACCOUNT_BLOCK',
});

export const TRIGGERS = {
  [TRIGGER_TYPES.WEATHER]: { active: true },
  [TRIGGER_TYPES.DOWNTIME]: { active: true },
  [TRIGGER_TYPES.STRIKE]: { active: true },
  [TRIGGER_TYPES.ACCIDENT]: { active: true },
  [TRIGGER_TYPES.ACCOUNT_BLOCK]: { active: true },
};

const SUPPORTED_TYPES = new Set(Object.values(TRIGGER_TYPES));

function assertTriggerAllowed(type) {
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`Unsupported trigger type: ${type}`);
  }

  if (!TRIGGERS[type]?.active) {
    throw new Error(`Trigger is inactive: ${type}`);
  }
}

// This function is intentionally isolated so we can later plug a full pipeline:
// Trigger -> Claim Creation -> Fraud Detection -> Payout
function createDisruptionEvent(type, userId, meta) {
  return {
    type,
    userId,
    meta,
    timestamp: new Date().toISOString(),
  };
}

export function triggerDisruption(type, userId, meta = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  assertTriggerAllowed(type);

  const event = createDisruptionEvent(type, userId, meta);

  console.log(`[Trigger Fired] type=${type}`, { meta });

  return event;
}
