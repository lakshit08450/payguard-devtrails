import express from 'express';
import {
  monitoringStatus,
  startMonitoring,
  stopMonitoring,
  monitoringStream,
} from '../controllers/monitorController.js';

const router = express.Router();

router.post('/start', startMonitoring);
router.post('/stop', stopMonitoring);
router.get('/status', monitoringStatus);
router.get('/stream', monitoringStream);

export default router;
