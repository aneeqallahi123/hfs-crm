import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import engagementRoutes from './routes/engagements.js';
import itemRoutes from './routes/items.js';
import inboxRoutes from './routes/inbox.js';
import documentRoutes from './routes/documents.js';
import teamRoutes from './routes/team.js';
import webhookRoutes from './routes/webhooks.js';
import eventRoutes from './routes/events.js';
import { verifyToken } from './middleware/auth.js';
import { ensureBucket } from './storage/minio.js';
import { runMigrations, runAdminPasswordFix } from './db/migrate.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 300 });

// /auth/me and /auth/refresh are session-restore calls — use the lighter API limiter
// Only login and logout need the strict auth limiter
app.use('/api/auth/me', apiLimiter, authRoutes);
app.use('/api/auth/refresh', apiLimiter, authRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/webhooks', webhookRoutes);      // webhook auth is its own shared-secret check, not JWT

app.use('/api', apiLimiter, verifyToken);     // everything below requires JWT

app.use('/api/clients', clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/events', eventRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => runAdminPasswordFix())
  .then(() => ensureBucket().catch(err => {
    console.warn('MinIO bucket check failed (non-fatal):', err.message);
  }))
  .then(() => {
    app.listen(PORT, () => console.log(`HFC API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
