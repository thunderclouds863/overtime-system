import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth.js';
import recordsRouter from './routes/records.js';
import approvalRouter from './routes/approval.js';
import schedulerRouter from './routes/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — izinkan frontend URL
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (mobile app, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.pages.dev')) {
      return callback(null, true);
    }
    callback(null, true); // Sementara izinkan semua untuk testing
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/approval', approvalRouter);
app.use('/api/scheduler', schedulerRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'Overtime Management API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      records: '/api/records',
      approval: '/api/approval',
      scheduler: '/api/scheduler'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});