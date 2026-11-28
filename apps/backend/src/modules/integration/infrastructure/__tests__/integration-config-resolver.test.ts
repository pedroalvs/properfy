import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  IIntegrationSettingRepository,
  IntegrationSetting,
} from '../../domain/integration-setting';
import { IntegrationConfigResolver } from '../integration-config-resolver';

const noopLogger = { warn: vi.fn(), error: vi.fn() };

function makeRepo(rows: Partial<Record<string, IntegrationSetting>>): IIntegrationSettingRepository {
  return {
    get: vi.fn(async (provider) => rows[provider] ?? null),
    list: vi.fn(async () => Object.values(rows).filter((r): r is IntegrationSetting => !!r)),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
}

function dbRow(provider: 'resend' | 'mobile_message' | 'mapbox', config: Record<string, string>, enabled = true): IntegrationSetting {
  return { provider, config, enabled, updatedById: null, updatedAt: new Date('2026-07-07T00:00:00Z') };
}

describe('IntegrationConfigResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers a complete database config over env', async () => {
    const repo = makeRepo({
      resend: dbRow('resend', { apiKey: 'db-key', fromEmail: 'db@x.com' }),
    });
    const resolver = new IntegrationConfigResolver(repo, {
      resend: { apiKey: 'env-key', fromEmail: 'env@x.com' },
    }, noopLogger);

    const resolved = await resolver.getConfig('resend');
    expect(resolved).toEqual({
      config: { apiKey: 'db-key', fromEmail: 'db@x.com' },
      source: 'database',
    });
  });

  it('falls back to env when no database row exists', async () => {
    const resolver = new IntegrationConfigResolver(makeRepo({}), {
      mapbox: { accessToken: 'env-token' },
    }, noopLogger);

    expect(await resolver.getConfig('mapbox')).toEqual({
      config: { accessToken: 'env-token' },
      source: 'env',
    });
  });

  it('returns null when neither database nor env is configured', async () => {
    const resolver = new IntegrationConfigResolver(makeRepo({}), {}, noopLogger);
    expect(await resolver.getConfig('resend')).toBeNull();
  });

  it('treats an incomplete database config as unconfigured and falls back to env', async () => {
    const repo = makeRepo({ resend: dbRow('resend', { apiKey: 'only-key' }) });
    const resolver = new IntegrationConfigResolver(repo, {
      resend: { apiKey: 'env-key', fromEmail: 'env@x.com' },
    }, noopLogger);

    expect((await resolver.getConfig('resend'))?.source).toBe('env');
  });

  it('ignores a disabled database row (explicit off) without env fallback', async () => {
    const repo = makeRepo({
      mapbox: dbRow('mapbox', { accessToken: 'db-token' }, false),
    });
    const resolver = new IntegrationConfigResolver(repo, {
      mapbox: { accessToken: 'env-token' },
    }, noopLogger);

    // disabled = integration intentionally turned off; do not silently use env
    expect(await resolver.getConfig('mapbox')).toBeNull();
  });

  it('caches lookups and refetches after invalidate', async () => {
    const repo = makeRepo({ mapbox: dbRow('mapbox', { accessToken: 't1' }) });
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);

    await resolver.getConfig('mapbox');
    await resolver.getConfig('mapbox');
    expect(repo.get).toHaveBeenCalledTimes(1);

    resolver.invalidate('mapbox');
    await resolver.getConfig('mapbox');
    expect(repo.get).toHaveBeenCalledTimes(2);
  });

  it('expires the cache after the TTL', async () => {
    vi.useFakeTimers();
    try {
      const repo = makeRepo({ mapbox: dbRow('mapbox', { accessToken: 't1' }) });
      const resolver = new IntegrationConfigResolver(repo, {}, noopLogger, 60_000);

      await resolver.getConfig('mapbox');
      vi.advanceTimersByTime(61_000);
      await resolver.getConfig('mapbox');
      expect(repo.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls through to env when the repository throws (e.g. decrypt failure)', async () => {
    const repo = makeRepo({});
    (repo.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('decrypt failed'));
    const resolver = new IntegrationConfigResolver(repo, {
      resend: { apiKey: 'env-key', fromEmail: 'env@x.com' },
    }, noopLogger);

    expect((await resolver.getConfig('resend'))?.source).toBe('env');
    expect(noopLogger.error).toHaveBeenCalled();
  });

  it('reports status for all providers', async () => {
    const repo = makeRepo({ resend: dbRow('resend', { apiKey: 'k', fromEmail: 'a@b.c' }) });
    const resolver = new IntegrationConfigResolver(repo, {
      mapbox: { accessToken: 'env-token' },
    }, noopLogger);

    const status = await resolver.getStatus();
    expect(status).toEqual([
      { provider: 'resend', configured: true, source: 'database', enabled: true },
      { provider: 'mobile_message', configured: false, source: 'none', enabled: true },
      { provider: 'mapbox', configured: true, source: 'env', enabled: true },
    ]);
  });
});
