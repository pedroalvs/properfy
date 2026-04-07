import { z } from 'zod';

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY is required'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required'),

  // Required with defaults
  JWT_KEY_ID: z.string().default('properfy-key-v1'),
  /** Access token TTL in minutes (default: 60) */
  JWT_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_JOB_QUEUE: z.enum(['true', 'false']).default('false'),

  // Optional JWT rotation
  JWT_PREVIOUS_PUBLIC_KEY: z.string().optional(),
  JWT_PREVIOUS_KEY_ID: z.string().optional(),
  /** ISO-8601 date after which the previous key is rejected (default: 30 days from startup) */
  JWT_PREVIOUS_KEY_EXPIRES_AT: z.string().optional(),

  // Optional Supabase S3
  SUPABASE_S3_ENDPOINT: z.string().optional(),
  SUPABASE_S3_ACCESS_KEY_ID: z.string().optional(),
  SUPABASE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('properfy-assets'),
  SUPABASE_STORAGE_PUBLIC_URL: z.string().optional(),

  // Optional Resend
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Optional Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Optional WhatsApp (Zenvia)
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_API_URL: z.string().optional(),

  // Optional Mapbox
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Optional TOTP encryption
  TOTP_ENCRYPTION_KEY: z.string().optional(),

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

  // TOTP_ENCRYPTION_KEY is required in non-development/test environments
  if (!result.data.TOTP_ENCRYPTION_KEY && result.data.NODE_ENV !== 'development' && result.data.NODE_ENV !== 'test') {
    throw new Error(
      'Environment validation failed:\n  - TOTP_ENCRYPTION_KEY: Required in non-development environments (32 bytes, hex or base64 encoded)',
    );
  }

  const isStrictRuntime =
    result.data.NODE_ENV === 'staging' || result.data.NODE_ENV === 'production';

  if (isStrictRuntime) {
    const strictIssues: string[] = [];

    if (result.data.ENABLE_JOB_QUEUE !== 'true') {
      strictIssues.push('  - ENABLE_JOB_QUEUE: Must be true in staging/production');
    }

    if (!result.data.SUPABASE_S3_ENDPOINT || !result.data.SUPABASE_S3_ACCESS_KEY_ID || !result.data.SUPABASE_S3_SECRET_ACCESS_KEY) {
      strictIssues.push('  - Supabase S3: SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY are required in staging/production');
    }

    if (!result.data.RESEND_API_KEY || !result.data.RESEND_FROM_EMAIL) {
      strictIssues.push('  - Resend: RESEND_API_KEY and RESEND_FROM_EMAIL are required in staging/production');
    }

    if (!result.data.TWILIO_ACCOUNT_SID || !result.data.TWILIO_AUTH_TOKEN || !result.data.TWILIO_PHONE_NUMBER) {
      strictIssues.push('  - Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are required in staging/production');
    }

    if (!result.data.MAPBOX_ACCESS_TOKEN) {
      strictIssues.push('  - MAPBOX_ACCESS_TOKEN: Required in staging/production');
    }

    if (strictIssues.length > 0) {
      throw new Error(`Environment validation failed:\n${strictIssues.join('\n')}`);
    }
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
