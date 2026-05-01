import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env (local dev). On Vercel, env vars are provided by the platform.
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Routes
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';
import loanRoutes from './routes/loan.routes';
import financeRoutes from './routes/finance.routes';
import reportRoutes from './routes/report.routes';
import activityRoutes from './routes/activity.routes';
import settingsRoutes from './routes/settings.routes';

export function createApp() {
  const app = express();

  const normalizeOrigin = (value: string) => {
    const trimmed = value.trim();
    const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
    return unquoted.replace(/\/+$/, '');
  };

  const allowedOrigins = new Set(
    [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      process.env.FRONTEND_ORIGIN,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ]
      .filter(Boolean)
      .map((o) => normalizeOrigin(String(o))) as string[],
  );

  // Middleware
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);

        const normalizedOrigin = normalizeOrigin(origin);
        if (allowedOrigins.has(normalizedOrigin)) {
          // Echo the allowed origin (required when credentials=true)
          return cb(null, normalizedOrigin);
        }

        console.warn('CORS blocked origin:', origin);
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/loans', loanRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/settings', settingsRoutes);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
