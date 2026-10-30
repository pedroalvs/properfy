import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedIntegrationConfig } from '../../domain/integration-setting';
import type { IntegrationConfigResolver } from '../integration-config-resolver';
import {
  DynamicEmailProvider,
  DynamicGeocodingService,
  DynamicSmsProvider,
} from '../dynamic-providers';

const sendSpy = vi.fn(async () => ({ messageId: 'real-id' }));
const geocodeSpy = vi.fn(async () => ({ lat: -33.8, lng: 151.2 }));

// Mock the concrete providers so no HTTP client is exercised.
vi.mock('../../../notification/infrastructure/resend-email.provider', () => ({
  ResendEmailProvider: vi.fn().mockImplementation(() => ({ send: sendSpy })),
}));
vi.mock('../../../notification/infrastructure/mobile-message-sms.provider', () => ({
  MobileMessageSmsProvider: vi.fn().mockImplementation(() => ({
    send: sendSpy,
    getStatus: vi.fn(async () => 'delivered'),
  })),
}));

vi.mock('../../../property/infrastructure/mapbox-geocoding.service', () => ({
  MapboxGeocodingService: vi.fn().mockImplementation(() => ({ geocode: geocodeSpy })),
}));

import { ResendEmailProvider } from '../../../notification/infrastructure/resend-email.provider';
import { MapboxGeocodingService } from '../../../property/infrastructure/mapbox-geocoding.service';

function fakeResolver(sequence: Array<ResolvedIntegrationConfig | null>): IntegrationConfigResolver {
  const getConfig = vi.fn();
  for (const value of sequence) getConfig.mockResolvedValueOnce(value);
  getConfig.mockResolvedValue(sequence[sequence.length - 1] ?? null);
  return { getConfig } as unknown as IntegrationConfigResolver;
}

describe('DynamicEmailProvider', () => {
  beforeEach(() => {
    // The constructor mock is module-level; clear call history so each test's
    // rebuild-count assertions start from zero.
    vi.clearAllMocks();
  });

  it('falls back to the stub when nothing is configured', async () => {
    const provider = new DynamicEmailProvider(fakeResolver([null]));
    const result = await provider.send('a@b.c', 's', '<p/>', 't');
    expect(result.messageId).toMatch(/^stub-email-/);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('uses the real provider when configured and rebuilds it when config changes', async () => {
    const resolver = fakeResolver([
      { config: { apiKey: 'k1', fromEmail: 'a@x.com' }, source: 'env' },
      { config: { apiKey: 'k1', fromEmail: 'a@x.com' }, source: 'env' },
      { config: { apiKey: 'k2', fromEmail: 'a@x.com' }, source: 'database' },
    ]);
    const provider = new DynamicEmailProvider(resolver);

    await provider.send('a@b.c', 's', '<p/>', 't');
    await provider.send('a@b.c', 's', '<p/>', 't');
    expect(ResendEmailProvider).toHaveBeenCalledTimes(1);

    await provider.send('a@b.c', 's', '<p/>', 't');
    expect(ResendEmailProvider).toHaveBeenCalledTimes(2);
    expect(ResendEmailProvider).toHaveBeenLastCalledWith('k2', 'a@x.com', {
      bccRecipient: undefined,
      systemFromEmail: undefined,
      systemBccRecipient: undefined,
    });
  });

  it('rebuilds the provider when an identity config key changes', async () => {
    const resolver = fakeResolver([
      { config: { apiKey: 'k1', fromEmail: 'a@x.com' }, source: 'database' },
      {
        config: { apiKey: 'k1', fromEmail: 'a@x.com', systemFromEmail: 'sys@x.com' },
        source: 'database',
      },
    ]);
    const provider = new DynamicEmailProvider(resolver);

    await provider.send('a@b.c', 's', '<p/>', 't');
    await provider.send('a@b.c', 's', '<p/>', 't');

    expect(ResendEmailProvider).toHaveBeenCalledTimes(2);
    expect(ResendEmailProvider).toHaveBeenLastCalledWith('k1', 'a@x.com', {
      bccRecipient: undefined,
      systemFromEmail: 'sys@x.com',
      systemBccRecipient: undefined,
    });
  });

  it('passes the env identity defaults through to Resend', async () => {
    const provider = new DynamicEmailProvider(
      fakeResolver([{ config: { apiKey: 'k1', fromEmail: 'a@x.com' }, source: 'database' }]),
      {
        bccRecipient: 'supervision@properfy.me',
        systemFromEmail: 'system@properfy.me',
        systemBccRecipient: 'system-archive@properfy.me',
      },
    );

    await provider.send('a@b.c', 's', '<p/>', 't');

    expect(ResendEmailProvider).toHaveBeenCalledWith('k1', 'a@x.com', {
      bccRecipient: 'supervision@properfy.me',
      systemFromEmail: 'system@properfy.me',
      systemBccRecipient: 'system-archive@properfy.me',
    });
  });

  it('prefers database identity values over env defaults, per field', async () => {
    const provider = new DynamicEmailProvider(
      fakeResolver([
        {
          config: { apiKey: 'k1', fromEmail: 'a@x.com', bccRecipient: 'db-bcc@x.com' },
          source: 'database',
        },
      ]),
      { bccRecipient: 'env-bcc@x.com', systemFromEmail: 'env-sys@x.com' },
    );

    await provider.send('a@b.c', 's', '<p/>', 't');

    expect(ResendEmailProvider).toHaveBeenCalledWith('k1', 'a@x.com', {
      bccRecipient: 'db-bcc@x.com',
      systemFromEmail: 'env-sys@x.com',
      systemBccRecipient: undefined,
    });
  });

  it('forwards send options to the inner provider', async () => {
    const provider = new DynamicEmailProvider(
      fakeResolver([{ config: { apiKey: 'k1', fromEmail: 'a@x.com' }, source: 'database' }]),
    );

    await provider.send('a@b.c', 's', '<p/>', 't', { identity: 'system' });

    expect(sendSpy).toHaveBeenCalledWith('a@b.c', 's', '<p/>', 't', { identity: 'system' });
  });
});

describe('DynamicGeocodingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. falls back to the stub (null) and reports not configured when unconfigured', async () => {
    const svc = new DynamicGeocodingService(fakeResolver([null, null]));
    await expect(svc.geocode('A')).resolves.toBeNull();
    await expect(svc.isConfigured()).resolves.toBe(false);
    expect(geocodeSpy).not.toHaveBeenCalled();
  });

  it('2. reports configured when a mapbox config resolves', async () => {
    const svc = new DynamicGeocodingService(
      fakeResolver([{ config: { accessToken: 'tok' }, source: 'database' }]),
    );
    await expect(svc.isConfigured()).resolves.toBe(true);
  });

  it('3. passes a temporary mode through to the inner service', async () => {
    const svc = new DynamicGeocodingService(
      fakeResolver([{ config: { accessToken: 'tok' }, source: 'database' }]),
    );
    await svc.geocode('A', { mode: 'temporary' });
    expect(geocodeSpy).toHaveBeenCalledWith('A', { mode: 'temporary' });
  });

  it('4. forwards undefined options when none are given', async () => {
    const svc = new DynamicGeocodingService(
      fakeResolver([{ config: { accessToken: 'tok' }, source: 'database' }]),
    );
    await svc.geocode('A');
    expect(geocodeSpy).toHaveBeenCalledWith('A', undefined);
  });

  it('5. recreates the adapter when the access token changes', async () => {
    const svc = new DynamicGeocodingService(
      fakeResolver([
        { config: { accessToken: 'tok1' }, source: 'database' },
        { config: { accessToken: 'tok1' }, source: 'database' },
        { config: { accessToken: 'tok2' }, source: 'database' },
      ]),
    );
    await svc.geocode('A');
    await svc.geocode('A');
    expect(MapboxGeocodingService).toHaveBeenCalledTimes(1);
    await svc.geocode('A');
    expect(MapboxGeocodingService).toHaveBeenCalledTimes(2);
    expect(MapboxGeocodingService).toHaveBeenLastCalledWith('tok2');
  });
});

describe('DynamicSmsProvider', () => {
  it('falls back to the stub when unconfigured, real provider when configured', async () => {
    const unconfigured = new DynamicSmsProvider(fakeResolver([null]));
    expect((await unconfigured.send('+61', 'hi')).messageId).toMatch(/^stub-sms-/);

    const configured = new DynamicSmsProvider(
      fakeResolver([{ config: { apiKey: 'k', password: 'p', senderId: 's' }, source: 'database' }]),
    );
    expect((await configured.send('+61', 'hi')).messageId).toBe('real-id');
  });
});
