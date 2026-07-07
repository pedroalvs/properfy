import { describe, expect, it } from 'vitest';

import {
  IntegrationProvider,
  integrationConfigSchemas,
  integrationDetailSchema,
  integrationProviderSchema,
  integrationStatusSchema,
  integrationUpsertSchema,
  mapboxConfigSchema,
  mobileMessageConfigSchema,
  resendConfigSchema,
} from './integration';

describe('integrationProviderSchema', () => {
  it('accepts the three managed providers', () => {
    expect(integrationProviderSchema.parse('resend')).toBe('resend');
    expect(integrationProviderSchema.parse('mobile_message')).toBe('mobile_message');
    expect(integrationProviderSchema.parse('mapbox')).toBe('mapbox');
  });

  it('rejects unknown providers', () => {
    expect(integrationProviderSchema.safeParse('supabase').success).toBe(false);
    expect(integrationProviderSchema.safeParse('').success).toBe(false);
  });
});

describe('per-provider config schemas', () => {
  it('resend accepts partial updates (write-only secrets)', () => {
    expect(resendConfigSchema.parse({})).toEqual({});
    expect(
      resendConfigSchema.parse({ apiKey: 're_123', fromEmail: 'no-reply@x.com' }),
    ).toEqual({ apiKey: 're_123', fromEmail: 'no-reply@x.com' });
  });

  it('resend rejects invalid fromEmail', () => {
    expect(resendConfigSchema.safeParse({ fromEmail: 'not-an-email' }).success).toBe(false);
  });

  it('mobile_message accepts full config including webhookToken', () => {
    const parsed = mobileMessageConfigSchema.parse({
      apiKey: 'k',
      password: 'p',
      senderId: 'Properfy',
      webhookToken: 't',
    });
    expect(parsed.webhookToken).toBe('t');
  });

  it('rejects empty-string secrets', () => {
    expect(mapboxConfigSchema.safeParse({ accessToken: '' }).success).toBe(false);
    expect(mobileMessageConfigSchema.safeParse({ apiKey: '  ' }).success).toBe(false);
  });

  it('has a config schema for every provider', () => {
    for (const provider of Object.values(IntegrationProvider)) {
      expect(integrationConfigSchemas[provider]).toBeDefined();
    }
  });
});

describe('integrationUpsertSchema', () => {
  it('accepts a config record with optional enabled flag', () => {
    expect(
      integrationUpsertSchema.parse({ config: { apiKey: 'x' }, enabled: false }),
    ).toEqual({ config: { apiKey: 'x' }, enabled: false });
  });

  it('requires config', () => {
    expect(integrationUpsertSchema.safeParse({}).success).toBe(false);
  });
});

describe('status/detail response schemas', () => {
  it('validates a status row', () => {
    expect(
      integrationStatusSchema.parse({
        provider: 'resend',
        configured: true,
        source: 'database',
        enabled: true,
      }).source,
    ).toBe('database');
  });

  it('rejects an unknown source', () => {
    expect(
      integrationStatusSchema.safeParse({
        provider: 'resend',
        configured: true,
        source: 'file',
        enabled: true,
      }).success,
    ).toBe(false);
  });

  it('validates a detail row with masked config', () => {
    const detail = integrationDetailSchema.parse({
      provider: 'mobile_message',
      configured: false,
      source: 'none',
      enabled: true,
      maskedConfig: { apiKey: '••••ab12', senderId: 'Properfy', password: null },
      updatedAt: null,
    });
    expect(detail.maskedConfig.apiKey).toBe('••••ab12');
  });
});
