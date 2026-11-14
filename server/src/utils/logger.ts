import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

export const logger = pino({
  level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'password',
      'passwordHash',
      'currentPassword',
      'newPassword',
      'token',
      'JWT_SECRET',
      'ADMIN_PASSWORD',
      'CLOUDINARY_API_SECRET'
    ],
    censor: '[REDACTED]'
  }
});
