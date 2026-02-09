import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { generalLimiter } from './shared/middleware/rateLimiter';
import { errorHandler } from './shared/middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import vaultRoutes from './modules/vault/vault.routes';
import voiceRoutes from './modules/voice/voice.routes';
import keysRoutes from './modules/keys/keys.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: config.cors.origin }));
app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/keys', keysRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;
