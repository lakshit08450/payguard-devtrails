import {
  getAutoMonitoringStatus,
  startAutoMonitoring,
  stopAutoMonitoring,
  subscribeToMonitorEvents,
} from '../services/autoMonitorService.js';

export function startMonitoring(req, res) {
  try {
    const status = startAutoMonitoring(req.body || {});
    return res.json({ success: true, message: 'Auto monitoring started', monitoring: status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export function stopMonitoring(req, res) {
  try {
    const status = stopAutoMonitoring(req.body?.userId);
    return res.json({ success: true, message: 'Auto monitoring stopped', monitoring: status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export function monitoringStatus(_, res) {
  return res.json({ success: true, monitoring: getAutoMonitoringStatus() });
}

export function monitoringStream(req, res) {
  const { userId } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send('connected', {
    message: 'Monitor stream connected',
    monitoring: getAutoMonitoringStatus(),
    timestamp: new Date().toISOString(),
  });

  const unsubscribe = subscribeToMonitorEvents((payload) => {
    if (userId && String(payload.userId) !== String(userId)) return;
    send('monitor-event', payload);
  });

  const heartbeat = setInterval(() => {
    send('heartbeat', { timestamp: new Date().toISOString() });
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}
