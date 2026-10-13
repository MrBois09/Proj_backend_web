import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { databaseStatus } from './config/database.js';
import { getAllowedOrigins } from './config/env.js';
import { csrfCookie, csrfProtection } from './middleware/security.js';
import { globalRateLimit } from './middleware/rateLimit.js';
import apiRoutes from './routes/index.js';

export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || getAllowedOrigins().includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(csrfCookie);
app.use(globalRateLimit);

app.get('/api/health', (_req, res) => {
  const status = databaseStatus();
  return res.status(status === 'ok' ? 200 : 503).json({
    success: status === 'ok',
    message: status === 'ok' ? 'Service healthy' : 'Service is running with degraded database connectivity',
    data: { status }
  });
});

app.use('/api', csrfProtection, apiRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body exceeds the 1 MB limit' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body contains invalid JSON' });
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Image exceeds the 5 MB file-size limit' });
  }
  if (error.name === 'MulterError') {
    return res.status(400).json({ success: false, message: 'Invalid image upload request' });
  }
  if (error.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Request origin is not allowed' });
  }
  if (error.code === 11000) {
    const fields = Object.keys(error.keyPattern || {});
    return res.status(409).json({
      success: false,
      message: fields.includes('email') ? 'Email is already in use' :
        fields.includes('username') ? 'Username is already in use' :
          fields.includes('gameId') ? 'A review or saved-game entry already exists' : 'A record with these values already exists'
    });
  }
  if (error.name === 'ValidationError') {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: Object.values(error.errors).map((item) => ({ field: item.path, message: item.message }))
    });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid resource identifier' });
  }
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error('Request failed with status code:', status);
  const body = { success: false, message: status >= 500 ? 'Internal server error' : error.message };
  if (error.errors) body.errors = error.errors;
  if (error.code && typeof error.code === 'string') body.code = error.code;
  if (process.env.NODE_ENV !== 'production' && status >= 500) body.debug = error.message;
  return res.status(status).json(body);
});
