import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedIntegrationConfig } from '../../domain/integration-setting';
import type { IntegrationConfigResolver } from '../integration-config-resolver';
import { DynamicEmailProvider, DynamicSmsProvider } from '../dynamic-providers';

const sendSpy = vi.fn(async () => ({ messageId: 'real-id' }));

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

import { ResendEmailProvider } from '../../../notification/infrastructure/resend-email.provider';

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
