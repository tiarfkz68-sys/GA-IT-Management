import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import userRoutes from './routes/users.js';
import statRoutes from './routes/stats.js';
import assetRoutes from './routes/assets.js';
import accessoryRoutes from './routes/accessories.js';
import consumableRoutes from './routes/consumables.js';
import ticketRoutes from './routes/tickets.js';
import activityLogRoutes from './routes/activityLogs.js';
import reportRoutes from './routes/reports.js';
import { sendError } from './utils/errorResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Global Security & Parsing Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com data:; connect-src 'self' https:;"
  );
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Domain Routes
app.use('/api/auth', authRoutes);
app.use('/api', settingsRoutes); // handles /api/settings and /api/categories
app.use('/api/users', userRoutes);
app.use('/api/stats', statRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/accessories', accessoryRoutes);
app.use('/api/consumables', consumableRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/reports', reportRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  sendError(res, 404, `Endpoint ${req.originalUrl} tidak ditemukan`, 'ENDPOINT_NOT_FOUND');
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  sendError(res, 500, err.message, 'UNHANDLED_SERVER_ERROR');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GA & IT Management Core V2 running on port ${PORT}`);
});

export default app;
