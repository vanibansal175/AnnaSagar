import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file if present
dotenv.config();

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(5001),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGODB_URI: z
      .string()
      .min(1, 'MONGODB_URI is required')
      .default(process.env['NODE_ENV'] === 'test' ? 'mongodb://localhost:27017/test' : ''),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters long')
      .default(
        process.env['NODE_ENV'] === 'test'
          ? 'test_jwt_secret_must_be_at_least_32_characters_long_for_security'
          : ''
      ),
    JWT_EXPIRES_IN: z.string().default('24h'),
    CLIENT_URL: z.string().default('http://localhost:3000'),
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .min(1, 'CLOUDINARY_CLOUD_NAME is required')
      .default(process.env['NODE_ENV'] === 'test' ? 'mock_cloud' : ''),
    CLOUDINARY_API_KEY: z
      .string()
      .min(1, 'CLOUDINARY_API_KEY is required')
      .default(process.env['NODE_ENV'] === 'test' ? 'mock_key' : ''),
    CLOUDINARY_API_SECRET: z
      .string()
      .min(1, 'CLOUDINARY_API_SECRET is required')
      .default(process.env['NODE_ENV'] === 'test' ? 'mock_secret' : ''),
    ADMIN_EMAIL: z
      .string()
      .email('ADMIN_EMAIL must be a valid email')
      .default(process.env['NODE_ENV'] === 'test' ? 'admin@example.com' : ''),
    ADMIN_PASSWORD: z
      .string()
      .min(12, 'ADMIN_PASSWORD must be at least 12 characters long')
      .default(process.env['NODE_ENV'] === 'test' ? 'AdminPass123!@#' : ''),
    MAX_LISTING_DURATION_MINUTES: z.coerce.number().int().positive().default(180),
    MIN_LISTING_DURATION_MINUTES: z.coerce.number().int().positive().default(45),
    MAX_FOOD_AGE_AT_PICKUP_MINUTES: z.coerce.number().int().positive().default(240),
    WARNING_MINUTES: z.coerce.number().int().positive().default(30)
  })
  .superRefine((data, ctx) => {
    if (data.MIN_LISTING_DURATION_MINUTES >= data.MAX_LISTING_DURATION_MINUTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MIN_LISTING_DURATION_MINUTES must be strictly less than MAX_LISTING_DURATION_MINUTES',
        path: ['MIN_LISTING_DURATION_MINUTES']
      });
    }

    if (data.WARNING_MINUTES >= data.MIN_LISTING_DURATION_MINUTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WARNING_MINUTES must be strictly less than MIN_LISTING_DURATION_MINUTES',
        path: ['WARNING_MINUTES']
      });
    }

    if (data.MAX_FOOD_AGE_AT_PICKUP_MINUTES <= data.MAX_LISTING_DURATION_MINUTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MAX_FOOD_AGE_AT_PICKUP_MINUTES must be strictly greater than MAX_LISTING_DURATION_MINUTES',
        path: ['MAX_FOOD_AGE_AT_PICKUP_MINUTES']
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ FATAL: Environment variable validation failed:');
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    // Only exit the process if not running in test mode where we might want to capture validation
    if (process.env['NODE_ENV'] !== 'test') {
      process.exit(1);
    }
    throw new Error('Environment validation failed');
  }
  return result.data;
}

export const env = loadConfig();
