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

  // Optional webhook signature secrets (skip validation when absent — dev mode)
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  // Fy agent outbound webhooks (env fallback; DB config via Integrations Hub wins)
  FY_WEBHOOK_URL: z.string().optional(),
  FY_WEBHOOK_SECRET: z.string().optional(),

  // Email assets (image library)
  EMAIL_ASSETS_BUCKET: z.string().default('email-assets'),
  EMAIL_ASSETS_PUBLIC_URL_BASE: z.string().optional(),
  /** Comma-separated list of email addresses allowed as test-send recipients (FR-027a) */
  EMAIL_TEST_RECIPIENT_ALLOWLIST: z.string().optional(),

  // Optional MobileMessage (SMS provider — no webhook secret, provider does not sign requests)
  MOBILE_MESSAGE_API_KEY: z.string().optional(),
  MOBILE_MESSAGE_SENDER_ID: z.string().optional(),
  // MOBILE_MESSAGE_PASSWORD is the Basic Auth password paired with MOBILE_MESSAGE_API_KEY as username
  MOBILE_MESSAGE_PASSWORD: z.string().optional(),
  // Shared secret for the ?token= query param on the delivery-receipt webhook
  // (MobileMessage does not sign requests). The webhook rejects all requests when unset.
  MOBILE_MESSAGE_WEBHOOK_TOKEN: z.string().optional(),

  // Optional Mapbox
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Optional TOTP encryption
  TOTP_ENCRYPTION_KEY: z.string().optional(),

  // AES-256-GCM key for encrypting tenant portal raw tokens (key-per-purpose from TOTP_ENCRYPTION_KEY)
  PORTAL_TOKEN_ENC_KEY: z
    .string()
    .min(44, 'PORTAL_TOKEN_ENC_KEY must be at least 44 chars (32 bytes base64) or 64 chars (32 bytes hex)')
    .optional(),

  // AES-256-GCM key for encrypting app-credential passwords at rest (key-per-purpose)
  APP_CREDENTIAL_ENC_KEY: z
    .string()
    .min(44, 'APP_CREDENTIAL_ENC_KEY must be at least 44 chars (32 bytes base64) or 64 chars (32 bytes hex)')
    .optional(),

  // Feature 020: retention worker batch size (FR-003)
  AUDIT_RETENTION_BATCH_SIZE: z.coerce.number().int().positive().default(1000),

  // Tenant portal SPA base URL used to build confirmationLink / rescheduleLink in templates
  // (e.g., https://app.properfy.com).
  TENANT_PORTAL_BASE_URL: z.string().default('http://localhost:5173'),

  // Web SPA base URL used to build password-reset links for non-inspector users.
  WEB_APP_BASE_URL: z.string().default('http://localhost:5173'),

  // PWA base URL used to build password-reset links for inspectors (INSP role).
  PWA_BASE_URL: z.string().default('http://localhost:5174'),

  // Optional direct DB URL (migrations)
  DIRECT_URL: z.string().optional(),

  // Optional direct (non-pooled) connection for pg-boss (advisory locks + LISTEN/NOTIFY
  // are incompatible with PgBouncer transaction mode). Falls back to DATABASE_URL.
  PG_BOSS_URL: z.string().optional(),

  // pg-boss schema — per-environment queue isolation. dev/staging/prod share one
  // Supabase database and pg-boss queues are NOT namespaced per environment, so any
  // process on the same schema is a peer consumer of all queues. Set a distinct value
  // per environment (e.g. pgboss_dev, pgboss_staging) to prevent cross-env job theft.
  PGBOSS_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, 'PGBOSS_SCHEMA must be a valid lowercase Postgres identifier')
    .optional(),
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

  // PORTAL_TOKEN_ENC_KEY is required in non-development/test environments
  if (!result.data.PORTAL_TOKEN_ENC_KEY && result.data.NODE_ENV !== 'development' && result.data.NODE_ENV !== 'test') {
    throw new Error(
      'Environment validation failed:\n  - PORTAL_TOKEN_ENC_KEY: Required in non-development environments (32 bytes, hex or base64 encoded)',
    );
  }

  // APP_CREDENTIAL_ENC_KEY is required in non-development/test environments
  if (!result.data.APP_CREDENTIAL_ENC_KEY && result.data.NODE_ENV !== 'development' && result.data.NODE_ENV !== 'test') {
    throw new Error(
      'Environment validation failed:\n  - APP_CREDENTIAL_ENC_KEY: Required in non-development environments (32 bytes, hex or base64 encoded)',
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

    // Resend, MobileMessage and Mapbox are no longer boot requirements: their
    // credentials are managed by AM via the Integrations Hub (database config,
    // env vars as fallback). When neither is configured the platform degrades
    // to stub providers and the dashboard surfaces a warning per integration.
    if (!result.data.RESEND_API_KEY || !result.data.RESEND_FROM_EMAIL) {
      console.warn('[env] Resend not configured via env; email sending relies on Integrations Hub settings (stub provider until configured)');
    }
    if (!result.data.MOBILE_MESSAGE_API_KEY || !result.data.MOBILE_MESSAGE_PASSWORD || !result.data.MOBILE_MESSAGE_SENDER_ID || !result.data.MOBILE_MESSAGE_WEBHOOK_TOKEN) {
      console.warn('[env] MobileMessage not fully configured via env; SMS sending relies on Integrations Hub settings (stub provider until configured)');
    }
    if (!result.data.MAPBOX_ACCESS_TOKEN) {
      console.warn('[env] MAPBOX_ACCESS_TOKEN not set; geocoding relies on Integrations Hub settings (stub service until configured)');
    }

    for (const [key, value] of [
      ['TENANT_PORTAL_BASE_URL', result.data.TENANT_PORTAL_BASE_URL],
      ['WEB_APP_BASE_URL', result.data.WEB_APP_BASE_URL],
      ['PWA_BASE_URL', result.data.PWA_BASE_URL],
    ] as [string, string][]) {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        strictIssues.push(`  - ${key}: Must be a valid URL in staging/production`);
        continue;
      }
      if (parsed.protocol !== 'https:') {
        strictIssues.push(`  - ${key}: Must use HTTPS in staging/production (got ${parsed.protocol})`);
      }
      const isLocalhost = parsed.hostname === 'localhost'
        || parsed.hostname === '127.0.0.1'
        || /^::1$/.test(parsed.hostname)
        || /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname)
        || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(parsed.hostname)
        || /^192\.168\.\d+\.\d+$/.test(parsed.hostname);
      if (isLocalhost) {
        strictIssues.push(`  - ${key}: Must not point to localhost or private network in staging/production`);
      }
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
