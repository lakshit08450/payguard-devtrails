import express from 'express';
import axios from 'axios';
import User from '../models/User.js';
import { sendOTP, verifyOTP } from '../controllers/otpService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Aadhaar Sandbox base (Sandbox.in government API)
const SANDBOX_BASE = process.env.AADHAAR_SANDBOX_URL || 'https://sandbox.in.gov.in/api/v1';
const SANDBOX_CLIENT_ID = process.env.AADHAAR_CLIENT_ID || 'SANDBOX_CLIENT';
const SANDBOX_SECRET = process.env.AADHAAR_CLIENT_SECRET || 'SANDBOX_SECRET';

// POST /api/kyc/aadhaar-otp  — send OTP to Aadhaar-linked mobile
router.post('/aadhaar-otp', authMiddleware, async (req, res) => {
  try {
    const { aadhaar } = req.body;
    if (!aadhaar || !/^\d{12}$/.test(aadhaar))
      return res.status(400).json({ success: false, message: 'Enter valid 12-digit Aadhaar number' });

    // Mask for logging
    const masked = 'XXXX XXXX ' + aadhaar.slice(-4);

    // If real Sandbox creds are present, call real API
    if (process.env.NODE_ENV === 'production' && process.env.AADHAAR_CLIENT_ID !== 'your_client_id') {
      const { data } = await axios.post(`${SANDBOX_BASE}/aadhaar/otp`, {
        uid: aadhaar,
        clientData: { id: SANDBOX_CLIENT_ID }
      }, {
        headers: { 'x-client-id': SANDBOX_CLIENT_ID, 'x-client-secret': SANDBOX_SECRET }
      });
      return res.json({ success: true, txnId: data.txnId, maskedAadhaar: masked });
    }

    // Sandbox / Development mode — simulate the flow
    const mockTxnId = 'TXN' + Date.now();
    console.log(`\n🆔 [AADHAAR SANDBOX] Aadhaar: ${masked} | TxnId: ${mockTxnId}`);
    console.log(`   Mock OTP: 123456\n`);

    res.json({ success: true, txnId: mockTxnId, maskedAadhaar: masked, sandboxMode: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/kyc/aadhaar-verify  — verify Aadhaar OTP
router.post('/aadhaar-verify', authMiddleware, async (req, res) => {
  try {
    const { txnId, otp, aadhaarLast4 } = req.body;
    if (!txnId || !otp)
      return res.status(400).json({ success: false, message: 'Transaction ID and OTP required' });

    let kycData = null;

    if (process.env.NODE_ENV === 'production' && process.env.AADHAAR_CLIENT_ID !== 'your_client_id') {
      const { data } = await axios.post(`${SANDBOX_BASE}/aadhaar/verify`, {
        txnId, otp,
        clientData: { id: SANDBOX_CLIENT_ID }
      }, {
        headers: { 'x-client-id': SANDBOX_CLIENT_ID, 'x-client-secret': SANDBOX_SECRET }
      });
      kycData = data;
    } else {
      // Sandbox: accept 123456
      if (otp !== '123456')
        return res.status(400).json({ success: false, message: 'Incorrect OTP. Use 123456 in sandbox mode.' });
      kycData = { name: req.user.name || 'Verified User', dob: '1995-01-01', gender: 'M', state: 'Maharashtra' };
    }

    // Update user KYC
    await User.findByIdAndUpdate(req.user._id, {
      isKycVerified: true,
      'kyc.aadhaarLast4': aadhaarLast4 || '0000',
      'kyc.verifiedAt': new Date(),
      'kyc.sandboxRef': txnId,
    });

    res.json({ success: true, message: 'KYC verified successfully', kycData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/kyc/link-platform
router.post('/link-platform', authMiddleware, async (req, res) => {
  try {
    const { platform } = req.body;
    const valid = ['swiggy', 'zomato', 'blinkit', 'zepto', 'dunzo'];
    if (!valid.includes(platform))
      return res.status(400).json({ success: false, message: 'Invalid platform' });

    const user = await User.findById(req.user._id);
    if (!user.platform.linked.includes(platform)) {
      user.platform.linked.push(platform);
      user.platform.linkedAt = new Date();
      await user.save();
    }

    res.json({ success: true, linked: user.platform.linked });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/kyc/zone-scan
router.post('/zone-scan', authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    // Mock zone data (real: call geolocation + risk DB)
    const zones = [
      { area: 'South Mumbai', city: 'Mumbai', riskScore: 12, flood: 'Low', traffic: 'High' },
      { area: 'Andheri West', city: 'Mumbai', riskScore: 28, flood: 'Medium', traffic: 'High' },
      { area: 'Koramangala', city: 'Bengaluru', riskScore: 8, flood: 'Low', traffic: 'Medium' },
      { area: 'Sector 62', city: 'Noida', riskScore: 15, flood: 'Low', traffic: 'Medium' },
      { area: 'T Nagar', city: 'Chennai', riskScore: 35, flood: 'High', traffic: 'High' },
    ];
    const zone = zones[Math.floor(Math.random() * zones.length)];

    await User.findByIdAndUpdate(req.user._id, {
      'zone.city': zone.city,
      'zone.area': zone.area,
      'zone.riskScore': zone.riskScore,
      'zone.lat': lat || 19.076,
      'zone.lng': lng || 72.877,
    });

    res.json({ success: true, zone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/kyc/location-update
router.post('/location-update', authMiddleware, async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const accuracy = Number(req.body?.accuracy ?? 0);
    const speed = Number(req.body?.speed ?? 0);
    const heading = Number(req.body?.heading ?? 0);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'lat and lng are required numbers' });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Invalid GPS coordinates' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.zone = {
      ...(user.zone || {}),
      lat,
      lng,
      accuracy,
      speed,
      heading,
      lastGpsAt: new Date().toISOString(),
    };

    await user.save();

    res.json({
      success: true,
      location: {
        lat,
        lng,
        accuracy,
        speed,
        heading,
        lastGpsAt: user.zone.lastGpsAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/kyc/location
router.get('/location', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      location: {
        lat: user.zone?.lat ?? null,
        lng: user.zone?.lng ?? null,
        accuracy: user.zone?.accuracy ?? null,
        speed: user.zone?.speed ?? null,
        heading: user.zone?.heading ?? null,
        lastGpsAt: user.zone?.lastGpsAt ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
