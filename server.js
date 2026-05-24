'use strict';
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./src/config/database');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Routes
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const orderRoutes = require('./src/routes/orders');
const inquiryRoutes = require('./src/routes/inquiries');
const projectRoutes = require('./src/routes/projects');
const adminRoutes = require('./src/routes/admin');
const uploadRoutes = require('./src/routes/upload');
const wageSlipRoutes = require('./src/routes/wageSlipRoutes');
const musterRoutes = require('./src/routes/muster');
const attendanceRoutes = require('./src/routes/attendance');
const employeeRoutes = require('./src/routes/employees');
const activityLogsRoutes = require('./src/routes/activityLogs');
const salaryRoutes = require('./src/routes/salary');
const excelUploadRoutes = require('./src/routes/excelUpload');
const reportRoutes = require('./src/routes/reports');
const paymentReceiptRoutes = require('./src/routes/paymentReceiptRoutes');
const { getUploadDir } = require('./src/utils/uploadPath');

// Connect Database
connectDB();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      scriptSrc: ["'self'"],
    },
  },
}));

// CORS
const envOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || '').split(','),
  ...(process.env.OAUTH_ALLOWED_CLIENT_URLS || '').split(','),
];

const allowedOrigins = [
  ...envOrigins,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://aditri-frontend2.vercel.app',
].map((origin) => origin?.trim()).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter auth rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);

// ─── General Middleware ────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Sanitize data
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// Static files (uploads)
app.use('/uploads', express.static(getUploadDir(), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  },
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/muster', musterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/excel', excelUploadRoutes);
app.use('/api/receipts', paymentReceiptRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/wage-slips', wageSlipRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/upload', uploadRoutes);

// Compatibility for older frontend chunks that accidentally prefixed /api twice.
app.use('/api/api/salary', salaryRoutes);
app.use('/api/api/attendance', attendanceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Aditri API is running', timestamp: new Date() });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "Backend working" });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Server Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

module.exports = app;
