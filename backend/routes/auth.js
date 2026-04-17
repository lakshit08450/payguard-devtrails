import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendOTP as sendOTPService, verifyOTP } from '../controllers/otpService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// JWT helper
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });


// ── SEND OTP ─────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, purpose = 'register' } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone required',
      });
    }

    const result = await sendOTPService(phone, purpose);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// ── VERIFY OTP ───────────────────────────────────────

router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, purpose = 'register', name } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP required',
      });
    }

    // Verify OTP using controller logic
    const record = await verifyOTP(phone, otp);

    if (!record.valid) {
      return res.status(400).json({
        success: false,
        message: record.reason,
      });
    }

    // REGISTER FLOW
    if (purpose === 'register') {
      let user = await User.findOneAndUpdate(
        { phone },
        {
          phone,
          name: name || '',
          isPhoneVerified: true,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      const token = signToken(user._id);

      return res.json({
        success: true,
        token,
        user: sanitizeUser(user),
        isNew: true,
      });
    }

    // LOGIN FLOW
    if (purpose === 'login') {
      const user = await User.findOne({ phone });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const token = signToken(user._id);

      return res.json({
        success: true,
        token,
        user: sanitizeUser(user),
      });
    }

    res.json({
      success: true,
      verified: true,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// ── PASSWORD LOGIN (optional) ─────────────────────────

router.post('/login-password', async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const ok = await user.comparePassword(password);

    if (!ok) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = signToken(user._id);

    res.json({
      success: true,
      token,
      user: sanitizeUser(user),
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// ── CURRENT USER ───────────────────────────────────────

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);

  res.json({
    success: true,
    user: sanitizeUser(user),
  });
});


// ── USER PREFERENCES ───────────────────────────────────

router.patch('/preferences', authMiddleware, async (req, res) => {
  const { language, theme } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { language, theme },
    { new: true }
  );

  res.json({
    success: true,
    user: sanitizeUser(user),
  });
});


// ── SANITIZE USER ──────────────────────────────────────

function sanitizeUser(u) {
  return {
    id: u._id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    isPhoneVerified: u.isPhoneVerified,
    isKycVerified: u.isKycVerified,
    kyc: u.kyc,
    platform: u.platform,
    zone: u.zone,
    policy: u.policy,
    language: u.language,
    theme: u.theme,
  };
}

export default router;