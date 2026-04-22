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

const getRequestIdentity = (req: express.Request): string => {
  // Always key on IP — never on the Bearer token (token rotation would bypass limits)
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
};

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Rate Limiting ─────────────────────────────────────────────────────────────

// Global limiter (for normal APIs)
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max || 100,
  keyGenerator: getRequestIdentity,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth limiter (login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // ✅ increased (no more 429 issues)
  keyGenerator: getRequestIdentity,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

// AI limiter (heavy APIs)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: getRequestIdentity,
  message: {
    success: false,
    message: 'AI rate limit exceeded. Please wait 1 minute.',
  },
});

const metaCampaignLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: getRequestIdentity,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Campaign refresh limit reached. Please wait a minute before retrying.',
  },
});

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: getRequestIdentity,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Analytics refresh limit reached. Please wait a minute before retrying.',
  },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  keyGenerator: getRequestIdentity,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Sync is already being requested too frequently. Please wait a minute.',
  },
});

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
    skip: (req) => req.path === '/health',
  })
);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── API Routes (FIXED STRUCTURE) ──────────────────────────────────────────────

// ✅ Auth routes → ONLY authLimiter (NO globalLimiter here)
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/campaigns/meta/list', metaCampaignLimiter);
app.use('/api/campaigns/sync', syncLimiter);

// ✅ Other APIs → globalLimiter
app.use('/api/campaigns', globalLimiter, campaignRoutes);
app.use('/api/adsets', globalLimiter, adSetRoutes);
app.use('/api/ads', globalLimiter, adsRoutes);
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/meta', globalLimiter, metaRoutes);

// ✅ AI APIs → custom limiter
app.use('/api/ai', aiLimiter, aiRoutes);

// ── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    logger.info(
      `🚀 AdInsight API running on port ${config.port} [${config.nodeEnv}]`
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  // Background workers (production only)
  if (config.nodeEnv === 'production') {
    try {
      const { schedulePeriodicSync } = await import('./workers/syncWorker');
      await schedulePeriodicSync();
      logger.info('⚙️ Background workers started');
    } catch (err) {
      logger.warn('⚠️ Background workers skipped (Redis unavailable):', err);
    }
  }
}

bootstrap();

export default app;