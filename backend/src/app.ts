import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { connectDatabase, config, logger } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import analyticsRoutes from './routes/analytics';
import aiRoutes from './modules/ai/ai.routes';
import adSetRoutes from './routes/adsets';
import adsRoutes from './routes/ads';
import metaRoutes from './routes/meta';

const app = express();

// ─────────────────────────────────────────────────────────
// 🔹 Helper
// ─────────────────────────────────────────────────────────
const getRequestIdentity = (req: express.Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
};

// ─────────────────────────────────────────────────────────
// 🔐 Security Middleware
// ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // ✅ safer for APIs
  })
);

app.use(
  cors({
    origin: config.frontendUrl || '*',
    credentials: true,
  })
);

// ─────────────────────────────────────────────────────────
// 🚦 Rate Limiters
// ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max || 100,
  keyGenerator: getRequestIdentity,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: getRequestIdentity,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: getRequestIdentity,
});

// ─────────────────────────────────────────────────────────
// 📦 Body Parsing
// ─────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────
// 📊 Logging
// ─────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

// ─────────────────────────────────────────────────────────
// ✅ ROOT ROUTE (FIXED)
// ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('🚀 AI Insight API is running');
});

// ─────────────────────────────────────────────────────────
// ✅ HEALTH ROUTE (UPDATED)
// ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────
// 📡 Routes
// ─────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/campaigns', globalLimiter, campaignRoutes);
app.use('/api/adsets', globalLimiter, adSetRoutes);
app.use('/api/ads', globalLimiter, adsRoutes);
app.use('/api/analytics', globalLimiter, analyticsRoutes);
app.use('/api/meta', globalLimiter, metaRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);

// ─────────────────────────────────────────────────────────
// ❌ Error Handling
// ─────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────────────────
// 🚀 Bootstrap
// ─────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    logger.info(`🚀 Server running on port ${config.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());

  // ✅ SAFE REDIS WORKER START
  if (process.env.REDIS_URL) {
    try {
      const { schedulePeriodicSync } = await import('./workers/syncWorker');
      await schedulePeriodicSync();
      logger.info('✅ Background workers started');
    } catch (err) {
      logger.warn('⚠️ Redis worker failed:', err);
    }
  } else {
    logger.warn('⚠️ Redis not configured, skipping workers');
  }
}

bootstrap();

export default app;
