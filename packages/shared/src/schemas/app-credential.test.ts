import { describe, it, expect } from 'vitest';
import {
  appCredentialCreateSchema,
  appCredentialUpdateSchema,
} from './app-credential';

describe('appCredentialCreateSchema', () => {
  const valid = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    name: 'Airbnb',
    username: 'host@example.com',
    password: 'super-secret',
  };

  it('accepts a valid payload', () => {
    expect(appCredentialCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('trims name and username', () => {
    const parsed = appCredentialCreateSchema.parse({ ...valid, name: '  Airbnb  ', username: '  host  ' });
    expect(parsed.name).toBe('Airbnb');
    expect(parsed.username).toBe('host');
  });

  it('requires a tenantId (uuid)', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, tenantId: 'nope' }).success).toBe(false);
    const { tenantId, ...withoutTenant } = valid;
    void tenantId;
    expect(appCredentialCreateSchema.safeParse(withoutTenant).success).toBe(false);
  });

  it('rejects empty name, username or password', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, username: '   ' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, password: '' }).success).toBe(false);
  });

  it('defaults needsAuthCode to false and new fields to absent', () => {
    const parsed = appCredentialCreateSchema.parse(valid);
    expect(parsed.needsAuthCode).toBe(false);
    expect(parsed.branchId).toBeUndefined();
    expect(parsed.authCode).toBeUndefined();
    expect(parsed.appUrl).toBeUndefined();
    expect(parsed.instructionsUrl).toBeUndefined();
    expect(parsed.instructionsPassword).toBeUndefined();
  });

  it('rejects non-http(s) URL schemes (javascript:, data:)', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsUrl: 'data:text/html,x' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: 'ftp://example.com/x' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: 'HTTPS://example.com/x' }).success).toBe(true);
  });

  it('accepts branchId as uuid or null and rejects non-uuid', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, branchId: '22222222-2222-2222-2222-222222222222' }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, branchId: null }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, branchId: 'nope' }).success).toBe(false);
  });

  it('requires authCode when needsAuthCode is true', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, needsAuthCode: true }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, needsAuthCode: true, authCode: null }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, needsAuthCode: true, authCode: '123456' }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, needsAuthCode: false, authCode: '123456' }).success).toBe(true);
  });

  it('validates appUrl and instructionsUrl as urls', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: 'https://example.com/app' }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: 'not a url' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsUrl: 'https://docs.example.com' }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsUrl: 'nope' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, appUrl: null, instructionsUrl: null }).success).toBe(true);
  });

  it('accepts instructionsPassword and rejects empty string', () => {
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsPassword: 'doc-pass' }).success).toBe(true);
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsPassword: '' }).success).toBe(false);
    expect(appCredentialCreateSchema.safeParse({ ...valid, instructionsPassword: null }).success).toBe(true);
  });
});

describe('appCredentialUpdateSchema', () => {
  it('accepts a partial payload', () => {
    expect(appCredentialUpdateSchema.safeParse({ password: 'new-pass' }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects empty provided fields', () => {
    expect(appCredentialUpdateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts new fields including null to clear', () => {
    expect(appCredentialUpdateSchema.safeParse({ branchId: null }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ branchId: '22222222-2222-2222-2222-222222222222' }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ needsAuthCode: true }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ authCode: null }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ appUrl: 'https://example.com', instructionsUrl: null }).success).toBe(true);
    expect(appCredentialUpdateSchema.safeParse({ instructionsPassword: 'x' }).success).toBe(true);
  });

  it('rejects invalid urls and empty secrets on update', () => {
    expect(appCredentialUpdateSchema.safeParse({ appUrl: 'nope' }).success).toBe(false);
    expect(appCredentialUpdateSchema.safeParse({ instructionsUrl: 'nope' }).success).toBe(false);
    expect(appCredentialUpdateSchema.safeParse({ authCode: '' }).success).toBe(false);
    expect(appCredentialUpdateSchema.safeParse({ instructionsPassword: '' }).success).toBe(false);
  });
});
