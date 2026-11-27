import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import recordsRouter, { reconcileActiveSessions } from './routes/records.js';
import approvalRouter from './routes/approval.js';
import schedulerRouter from './routes/scheduler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

// DEMO_MODE=1: instance portfolio terpisah — schema + akun demo otomatis,
// frontend disajikan dari backend yang sama (satu URL).
const DEMO_MODE = process.env.DEMO_MODE === '1';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: terima semua origin yang cocok
app.use(cors({
  origin: (origin, callback) => {
    // Request tanpa origin (curl, Postman, mobile) → izinkan
    if (!origin) return callback(null, true);

    const allowedPatterns = [
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
      /\.workers\.dev$/,
      /\.pages\.dev$/,
      /\.onrender\.com$/
    ];

    // FRONTEND_URL dari env (kalau ada)
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    if (allowedPatterns.some(p => p.test(origin))) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/records', recordsRouter);
app.use('/api/approval', approvalRouter);
app.use('/api/scheduler', schedulerRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

if (DEMO_MODE) {
  app.get('/demo-banner.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'deploy/demo-banner.js')));
}
if (DEMO_MODE || process.env.SERVE_FRONTEND === '1' || process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(ROOT_DIR, 'frontend')));
} else {
  app.get('/', (req, res) => {
    res.json({
      name: 'Overtime Management API',
      version: '1.0.0'
    });
  });
}

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin tidak diizinkan' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  if (DEMO_MODE) {
    const sql = fs.readFileSync(path.join(ROOT_DIR, 'database/demo_schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('🧪 DEMO_MODE: schema & akun demo siap');
  }
  await pool.query(`
    ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
    ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0;
    ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS auto_ended_reason TEXT;
  `).catch(err => console.warn('Schema sync note:', err.message));

  setInterval(() => { reconcileActiveSessions(); }, 60000);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
