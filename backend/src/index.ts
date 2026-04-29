import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Routes
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';
import loanRoutes from './routes/loan.routes';
import financeRoutes from './routes/finance.routes';
import reportRoutes from './routes/report.routes';
import activityRoutes from './routes/activity.routes';
import settingsRoutes from './routes/settings.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));
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

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
