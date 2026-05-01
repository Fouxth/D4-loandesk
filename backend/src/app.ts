import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env only in local development. 
// On Vercel, env vars are provided by the platform.
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(process.cwd(), '../.env') });
}

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
    return value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  };

  const allowedOriginsList = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    ...(process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',') : []),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]
    .filter(Boolean)
    .map((o) => normalizeOrigin(String(o)));

  const allowedOrigins = new Set(allowedOriginsList);

  // Middleware
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return cb(null, true);

        const normalizedOrigin = normalizeOrigin(origin);
        
        if (process.env.ALLOW_ANY_ORIGIN === 'true') {
          return cb(null, true);
        }

        if (allowedOrigins.has(normalizedOrigin)) {
          return cb(null, true);
        }

        // For Vercel preview deployments, allow any .vercel.app origin if configured
        if (process.env.ALLOW_VERCEL_PREVIEW === 'true' && normalizedOrigin.endsWith('.vercel.app')) {
          return cb(null, true);
        }

        console.warn('CORS blocked origin:', origin);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
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

  // Health checks
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', source: 'express', timestamp: new Date().toISOString() });
  });
  
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', source: 'express-api', timestamp: new Date().toISOString() });
  });

  // Root route
  app.get('/', (_req, res) => {
    res.json({ 
      message: 'Loan Management API is running',
      environment: process.env.NODE_ENV,
      version: '1.0.0'
    });
  });

  return app;
}
