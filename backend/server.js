import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import kycRoutes from './routes/kyc.js';
import policyRoutes from './routes/policy.js';
import adminRoutes from './routes/admin.js';
import simulateRoutes from './routes/simulate.js';
import monitorRoutes from './routes/monitor.js';
import premiumRoutes from './routes/premium.js';
import { initDb } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
let httpServer = null;
let retryTimer = null;
const MAX_BIND_RETRIES = 5;
let bindRetries = 0;

async function checkExistingServerHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return String(payload?.status || '').toLowerCase() === 'ok';
  } catch {
    return false;
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────
const configuredOrigin = process.env.FRONTEND_URL;
const allowedOrigins = new Set([
  configuredOrigin,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
].filter(Boolean));

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    // Allow same-origin server calls and tools that do not send Origin.
    if (!origin) return callback(null, true);
    // Dev-safe: allow localhost origins even when Vite auto-selects a new port.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin ${origin}`));
  },
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

// Rate limiting
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, message: 'Too many OTP requests. Try after 15 minutes.' } });
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 2000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/admin/login',
  message: { success: false, message: 'Too many API requests. Please retry shortly.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth/send-otp', otpLimiter);

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/simulate', simulateRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/simulate', simulateRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));
app.get("/", (req, res) => {
  res.send("PayGuard API is running 🚀");
});

// ── DB + Start ──────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await initDb();
    console.log('✅ SQLite connected');

    httpServer = createServer(app);

    const bindServer = () => {
      httpServer.listen(PORT, () => {
        bindRetries = 0;
        console.log(`🚀 PayGuard API running on :${PORT} (pid: ${process.pid})`);
      });
    };

    httpServer.on('error', (err) => {
      if (err?.code === 'EADDRINUSE' && bindRetries < MAX_BIND_RETRIES) {
        bindRetries += 1;
        const delayMs = 800 * bindRetries;
        console.warn(`⚠️ Port ${PORT} busy. Retry ${bindRetries}/${MAX_BIND_RETRIES} in ${delayMs}ms...`);
        retryTimer = setTimeout(() => {
          bindServer();
        }, delayMs);
        return;
      }

      if (err?.code === 'EADDRINUSE') {
        checkExistingServerHealth(PORT)
          .then((healthy) => {
            if (healthy) {
              console.log(`✅ Existing PayGuard API instance already running on :${PORT}. Reusing it.`);
              process.exit(0);
              return;
            }

            console.error(`❌ Port ${PORT} is still in use after ${MAX_BIND_RETRIES} retries.`);
            console.error('   Free the port (or change PORT) and restart the backend.');
            console.error('❌ HTTP server error:', err.message);
            process.exit(1);
          })
          .catch(() => {
            console.error(`❌ Port ${PORT} is still in use after ${MAX_BIND_RETRIES} retries.`);
            console.error('   Free the port (or change PORT) and restart the backend.');
            console.error('❌ HTTP server error:', err.message);
            process.exit(1);
          });
        return;
      }

      console.error('❌ HTTP server error:', err.message);
      process.exit(1);
    });

    bindServer();
  } catch (err) {
    console.error('❌ Startup error:', err.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down PayGuard API...`);

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  if (!httpServer) {
    process.exit(0);
    return;
  }

  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
