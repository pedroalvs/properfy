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
});
