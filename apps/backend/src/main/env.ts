import { z } from 'zod';

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY is required'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required'),

  // Required with defaults
  JWT_KEY_ID: z.string().default('properfy-key-v1'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_JOB_QUEUE: z.enum(['true', 'false']).default('false'),

  // Optional JWT rotation
  JWT_PREVIOUS_PUBLIC_KEY: z.string().optional(),
  JWT_PREVIOUS_KEY_ID: z.string().optional(),

  // Optional Supabase S3
  SUPABASE_S3_ENDPOINT: z.string().optional(),
  SUPABASE_S3_ACCESS_KEY_ID: z.string().optional(),
  SUPABASE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('properfy-assets'),

  // Optional Resend
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Optional Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Optional Mapbox
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Optional direct DB URL (migrations)
  DIRECT_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      `Environment validation failed:\n${issues.join('\n')}`,
    );
  }

  // CORS_ORIGIN is required in non-development environments
  if (!result.data.CORS_ORIGIN && result.data.NODE_ENV !== 'development' && result.data.NODE_ENV !== 'test') {
    throw new Error(
      'Environment validation failed:\n  - CORS_ORIGIN: Required in non-development environments',
    );
  }

  _env = result.data;
  return result.data;
}

export function getEnv(): Env {
  if (!_env) {
    throw new Error('Environment not validated. Call validateEnv() at startup.');
  }
  return _env;
}
