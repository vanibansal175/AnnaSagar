import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { getDatabaseState } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limiter.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  // Trust proxy for rate limiters and accurate client IP behind reverse proxy (Render)
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS configuration
  const allowedOrigins: string[] = [env.CLIENT_URL];
  if (env.NODE_ENV === 'development') {
    if (!allowedOrigins.includes('http://localhost:3000')) {
      allowedOrigins.push('http://localhost:3000');
    }
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Blocked by CORS policy'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  // Body parser
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // General API rate limiter
  app.use('/api', apiRateLimiter);

  // Public Health check
  app.get('/health', (_req, res) => {
    const dbState = getDatabaseState();
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      database: dbState.readyStateText
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/admin', adminRouter);

  // 404 Handler
  app.use(notFoundHandler);

  // Central Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
