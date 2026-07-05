import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../../src/main/env';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
  NODE_ENV: 'test',
};

describe('validateEnv', () => {
  it('should accept valid required config and apply defaults', () => {
    const result = validateEnv(validEnv);

    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.JWT_PRIVATE_KEY).toBe(validEnv.JWT_PRIVATE_KEY);
    expect(result.JWT_PUBLIC_KEY).toBe(validEnv.JWT_PUBLIC_KEY);
    expect(result.PORT).toBe(3000);
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.NODE_ENV).toBe('test');
    expect(result.JWT_KEY_ID).toBe('properfy-key-v1');
    expect(result.ENABLE_JOB_QUEUE).toBe('false');
    expect(result.SUPABASE_STORAGE_BUCKET).toBe('properfy-assets');
  });

  it('should throw when DATABASE_URL is missing', () => {
    const env = { ...validEnv };
    delete (env as any).DATABASE_URL;

    expect(() => validateEnv(env)).toThrow('Environment validation failed');
    expect(() => validateEnv(env)).toThrow('DATABASE_URL');
  });

  it('should throw when JWT_PRIVATE_KEY is missing', () => {
    const env = { ...validEnv };
    delete (env as any).JWT_PRIVATE_KEY;

    expect(() => validateEnv(env)).toThrow('JWT_PRIVATE_KEY');
  });

  it('should throw when JWT_PUBLIC_KEY is missing', () => {
    const env = { ...validEnv };
    delete (env as any).JWT_PUBLIC_KEY;

    expect(() => validateEnv(env)).toThrow('JWT_PUBLIC_KEY');
  });

  it('should list all missing vars in a single error', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
  });

  it('should coerce PORT to number', () => {
    const result = validateEnv({ ...validEnv, PORT: '8080' });
    expect(result.PORT).toBe(8080);
  });

  it('should reject invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      'Environment validation failed',
    );
  });

  it('should reject invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'local' })).toThrow(
      'Environment validation failed',
    );
  });

  it('should require CORS_ORIGIN in production', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGIN',
    );
  });

  it('should not require CORS_ORIGIN in development', () => {
    const result = validateEnv({ ...validEnv, NODE_ENV: 'development' });
    expect(result.CORS_ORIGIN).toBeUndefined();
  });

  it('should require MOBILE_MESSAGE_WEBHOOK_TOKEN (with the other MobileMessage vars) in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com',
        TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
        PORTAL_TOKEN_ENC_KEY: 'a'.repeat(64),
        APP_CREDENTIAL_ENC_KEY: 'a'.repeat(64),
        MOBILE_MESSAGE_API_KEY: 'mm-key',
        MOBILE_MESSAGE_PASSWORD: 'mm-pass',
        MOBILE_MESSAGE_SENDER_ID: 'PROPERFY',
      }),
    ).toThrow('MOBILE_MESSAGE_WEBHOOK_TOKEN');
  });

  it('should accept optional provider vars', () => {
    const result = validateEnv({
      ...validEnv,
      RESEND_API_KEY: 'key',
      RESEND_FROM_EMAIL: 'noreply@test.com',
      MOBILE_MESSAGE_API_KEY: 'mm-key',
      MOBILE_MESSAGE_SENDER_ID: 'PROPERFY',
      SUPABASE_S3_ENDPOINT: 'https://storage.example.com',
      SUPABASE_S3_ACCESS_KEY_ID: 'access-key',
      SUPABASE_S3_SECRET_ACCESS_KEY: 'secret-key',
    });

    expect(result.RESEND_API_KEY).toBe('key');
    expect(result.MOBILE_MESSAGE_API_KEY).toBe('mm-key');
    expect(result.SUPABASE_S3_ENDPOINT).toBe('https://storage.example.com');
  });
});
