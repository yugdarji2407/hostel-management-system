import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, corsOrigins } from './config/env.js';
import { requestId } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { originGuard } from './middleware/security.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import otpRoutes from './routes/otp.routes.js';
import studentRoutes from './routes/student.routes.js';
import moduleRoutes from './routes/modules.routes.js';
import securityRoutes from './routes/security.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminFinanceRoutes from './routes/admin.finance.routes.js';
import staffRoutes from './routes/staff.routes.js';

export const app = express();
app.set('trust proxy', env.TRUST_PROXY === 'true' ? 1 : 0);
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(originGuard);
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ksv-hostel-api' });
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'live' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ready',
      database: 'ok',
    });
  } catch {
    res.status(503).json({
      status: 'not_ready',
      database: 'unavailable',
    });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/otp', otpRoutes);
app.use('/api/v1/student', studentRoutes);
app.use('/api/v1', moduleRoutes);
app.use('/api/v1', securityRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin', adminFinanceRoutes);
app.use('/api/v1', staffRoutes);
app.use(notFound);
app.use(errorHandler);
