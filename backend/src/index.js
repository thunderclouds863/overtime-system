import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import recordsRouter from './routes/records.js';
import approvalRouter from './routes/approval.js';
import schedulerRouter from './routes/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: terima semua origin yang cocok
app.use(cors({
  origin: (origin, callback) => {
    // Request tanpa origin (curl, Postman, mobile) → izinkan
    if (!origin) return callback(null, true);

    const allowedPatterns = [
      /^https?:\/\/localhost(:\d+)?$/,
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

app.get('/', (req, res) => {
  res.json({
    name: 'Overtime Management API',
    version: '1.0.0'
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin tidak diizinkan' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
