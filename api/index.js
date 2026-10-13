import { app } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { validateEnvironment } from '../src/config/env.js';

let initialization;

export default async function handler(req, res) {
  try {
    validateEnvironment();
    const isHealthCheck = req.url?.split('?')[0] === '/api/health' || req.url?.split('?')[0] === '/health';
    if (isHealthCheck) {
      try {
        await connectDatabase();
      } catch {
        return app(req, res);
      }
      return app(req, res);
    }
    initialization ??= connectDatabase();
    await initialization;
    return app(req, res);
  } catch {
    initialization = undefined;
    console.error('API initialization failed');
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable'
    });
  }
}
