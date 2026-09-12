import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import engagementRoutes from './routes/engagements.js';
import itemRoutes from './routes/items.js';
import inboxRoutes from './routes/inbox.js';
import documentRoutes from './routes/documents.js';
import teamRoutes from './routes/team.js';
import libraryRoutes from './routes/library.js';
import clientLibraryRoutes from './routes/client-library.js';
import webhookRoutes from './routes/webhooks.js';
import eventRoutes from './routes/events.js';
import { verifyToken } from './middleware/auth.js';
import { ensureBucket, MINIO_SDK_VERSION } from './storage/minio.js';
import { runMigrations, runAdminPasswordFix } from './db/migrate.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true,
}));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
// Raised for ~30 concurrent users sharing office/NAT IPs against a dashboard
// that fetches lists on every navigation — same throttling behavior, more headroom.
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 600 });

// Webhook route gets its own body parser (must come before the global one).
// Inbound WhatsApp files arrive as a ~1KB metadata payload — Evolution API writes the bytes
// straight to MinIO and we receive only the object key — so this limit only has to cover the
// legacy base64 fallback, which is itself capped at MAX_INBOX_BASE64_MB. Sizing it off
// MAX_INBOX_FILE_MB is what used to buffer hundreds of MB per request in the Railway container.
const legacyBase64Mb = parseInt(process.env.MAX_INBOX_BASE64_MB || '15', 10);
const webhookBodyMb = Math.ceil(legacyBase64Mb * 1.37) + 1; // base64 inflates ~33%, plus JSON envelope
app.use('/api/webhooks', express.json({ limit: `${webhookBodyMb}mb` }), webhookRoutes);

app.use(express.json({ limit: '10mb' }));

// /auth/me and /auth/refresh are session-restore calls — use the lighter API limiter
// Only login and logout need the strict auth limiter
app.use('/api/auth/me', apiLimiter, authRoutes);
app.use('/api/auth/refresh', apiLimiter, authRoutes);
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api', apiLimiter, verifyToken);     // everything below requires JWT

app.use('/api/clients', clientLibraryRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/library', libraryRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => runAdminPasswordFix())
  .then(() => ensureBucket().catch(err => {
    console.warn('MinIO bucket check failed (non-fatal):', err.message);
  }))
  .then(() => {
    app.listen(PORT, () => console.log(`HFC API running on port ${PORT} (minio sdk ${MINIO_SDK_VERSION}, endpoint ${process.env.MINIO_ENDPOINT})`));
  })
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
