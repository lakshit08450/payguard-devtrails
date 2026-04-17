import express from 'express';
import {
  simulateWeather,
  simulateDowntime,
  simulateStrike,
  simulateAccident,
  simulateAccountBlock,
  listUserSimulations,
  listUserDetailedTimeline,
} from '../controllers/triggerController.js';

const router = express.Router();

router.post('/weather', simulateWeather);
router.post('/downtime', simulateDowntime);
router.post('/strike', simulateStrike);
router.post('/accident', simulateAccident);
router.post('/account-block', simulateAccountBlock);
router.get('/claims/:userId', listUserSimulations);
router.get('/timeline', listUserDetailedTimeline);

export default router;
