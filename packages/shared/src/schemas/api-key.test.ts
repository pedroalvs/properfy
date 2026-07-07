import { describe, expect, it } from 'vitest';

import {
  API_KEY_PLAINTEXT_PREFIX,
  apiKeyCreateSchema,
  apiKeyCreatedSchema,
  apiKeyResponseSchema,
} from './api-key';

describe('apiKeyCreateSchema', () => {
  it('defaults role to OP', () => {
    expect(apiKeyCreateSchema.parse({ name: 'n8n' }).role).toBe('OP');
  });

  it('accepts AM role and expiry', () => {
    const parsed = apiKeyCreateSchema.parse({
      name: 'automation',
      role: 'AM',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(parsed.role).toBe('AM');
    expect(parsed.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejects blank names and non-machine roles', () => {
    expect(apiKeyCreateSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(apiKeyCreateSchema.safeParse({ name: 'x', role: 'INSP' }).success).toBe(false);
  });
});

describe('apiKeyCreatedSchema', () => {
  const base = {
    id: '7f0c2c6a-6f5c-4b6e-9a44-1f2d3c4b5a69',
    name: 'n8n',
    prefix: 'pfy_ab12cd34',
    role: 'OP',
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: '2026-07-07T00:00:00.000Z',
  };

  it('requires the plaintext key to carry the pfy_ prefix', () => {
    expect(
      apiKeyCreatedSchema.parse({ ...base, key: `${API_KEY_PLAINTEXT_PREFIX}secret` }).key,
    ).toBe('pfy_secret');
    expect(apiKeyCreatedSchema.safeParse({ ...base, key: 'sk_secret' }).success).toBe(false);
  });

  it('list/response shape never includes the key or hash', () => {
    const parsed = apiKeyResponseSchema.parse(base);
    expect(parsed).not.toHaveProperty('key');
    expect(parsed).not.toHaveProperty('keyHash');
  });
});
