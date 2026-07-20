import { describe, expect, it, vi, beforeEach } from 'vitest';

import type {
  IIntegrationSettingRepository,
  IntegrationSetting,
} from '../../../src/modules/integration/domain/integration-setting';
import { IntegrationConfigResolver } from '../../../src/modules/integration/infrastructure/integration-config-resolver';
import { UpsertIntegrationSettingUseCase } from '../../../src/modules/integration/application/use-cases/upsert-integration-setting.use-case';
import { DeleteIntegrationSettingUseCase } from '../../../src/modules/integration/application/use-cases/delete-integration-setting.use-case';
import { ListIntegrationsUseCase } from '../../../src/modules/integration/application/use-cases/list-integrations.use-case';
import { TestIntegrationConnectionUseCase } from '../../../src/modules/integration/application/use-cases/test-integration-connection.use-case';
import { maskIntegrationConfig } from '../../../src/modules/integration/application/mask-integration-config';
import {
  IntegrationConfigInvalidError,
  IntegrationSettingNotFoundError,
} from '../../../src/modules/integration/domain/integration.errors';

const auditService = { log: vi.fn() } as any;
const noopLogger = { warn: vi.fn(), error: vi.fn() };

function makeRepo(initial: Record<string, IntegrationSetting> = {}) {
  const rows = new Map(Object.entries(initial));
  const repo: IIntegrationSettingRepository = {
    get: vi.fn(async (provider) => rows.get(provider) ?? null),
    list: vi.fn(async () => [...rows.values()]),
    upsert: vi.fn(async (provider, config, enabled, updatedById) => {
      const row: IntegrationSetting = {
        provider,
        config,
        enabled,
        updatedById,
        updatedAt: new Date('2026-07-07T12:00:00Z'),
      };
      rows.set(provider, row);
      return row;
    }),
    delete: vi.fn(async (provider) => {
      rows.delete(provider);
    }),
  };
  return repo;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('maskIntegrationConfig', () => {
  it('masks secrets to last 4 and passes non-secrets through', () => {
    expect(
      maskIntegrationConfig('resend', { apiKey: 're_1234abcd', fromEmail: 'no@x.com' }),
    ).toEqual({ apiKey: '••••abcd', fromEmail: 'no@x.com' });
  });

  it('returns null for unset keys and full mask for short secrets', () => {
    expect(maskIntegrationConfig('mobile_message', { apiKey: 'abc' })).toEqual({
      apiKey: '••••',
      password: null,
      senderId: null,
      webhookToken: null,
    });
  });
});

describe('UpsertIntegrationSettingUseCase', () => {
  it('saves a new config, invalidates the resolver cache and audits without secrets', async () => {
    const repo = makeRepo();
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const invalidateSpy = vi.spyOn(resolver, 'invalidate');
    const useCase = new UpsertIntegrationSettingUseCase(repo, resolver, auditService);

    const detail = await useCase.execute({
      provider: 'resend',
      config: { apiKey: 're_1234abcd', fromEmail: 'no@x.com' },
      actorId: 'am-1',
    });

    expect(detail.configured).toBe(true);
    expect(detail.source).toBe('database');
    expect(detail.maskedConfig['apiKey']).toBe('••••abcd');
    expect(invalidateSpy).toHaveBeenCalledWith('resend');
    const audit = auditService.log.mock.calls[0][0];
    expect(audit.action).toBe('integration_setting.upserted');
    expect(JSON.stringify(audit)).not.toContain('re_1234abcd');
  });

  it('merges omitted secret fields with the stored config (write-only secrets)', async () => {
    const repo = makeRepo({
      resend: {
        provider: 'resend',
        config: { apiKey: 're_oldkey99', fromEmail: 'old@x.com' },
        enabled: true,
        updatedById: 'am-1',
        updatedAt: new Date(),
      },
    });
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const useCase = new UpsertIntegrationSettingUseCase(repo, resolver, auditService);

    await useCase.execute({ provider: 'resend', config: { fromEmail: 'new@x.com' }, actorId: 'am-1' });

    expect(repo.upsert).toHaveBeenCalledWith(
      'resend',
      { apiKey: 're_oldkey99', fromEmail: 'new@x.com' },
      true,
      'am-1',
    );
  });

  it('rejects an invalid config', async () => {
    const repo = makeRepo();
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const useCase = new UpsertIntegrationSettingUseCase(repo, resolver, auditService);

    await expect(
      useCase.execute({ provider: 'resend', config: { fromEmail: 'nope' }, actorId: 'am-1' }),
    ).rejects.toBeInstanceOf(IntegrationConfigInvalidError);
  });

  it('marks an incomplete config as not configured', async () => {
    const repo = makeRepo();
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const useCase = new UpsertIntegrationSettingUseCase(repo, resolver, auditService);

    const detail = await useCase.execute({
      provider: 'mobile_message',
      config: { apiKey: 'only-key' },
      actorId: 'am-1',
    });
    expect(detail.configured).toBe(false);
  });
});

describe('DeleteIntegrationSettingUseCase', () => {
  it('deletes, invalidates and audits', async () => {
    const repo = makeRepo({
      mapbox: {
        provider: 'mapbox',
        config: { accessToken: 'pk.token123' },
        enabled: true,
        updatedById: 'am-1',
        updatedAt: new Date(),
      },
    });
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const invalidateSpy = vi.spyOn(resolver, 'invalidate');
    const useCase = new DeleteIntegrationSettingUseCase(repo, resolver, auditService);

    await useCase.execute({ provider: 'mapbox', actorId: 'am-1' });
    expect(repo.delete).toHaveBeenCalledWith('mapbox');
    expect(invalidateSpy).toHaveBeenCalledWith('mapbox');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'integration_setting.deleted' }),
    );
  });

  it('throws when nothing is stored', async () => {
    const repo = makeRepo();
    const resolver = new IntegrationConfigResolver(repo, {}, noopLogger);
    const useCase = new DeleteIntegrationSettingUseCase(repo, resolver, auditService);
    await expect(useCase.execute({ provider: 'mapbox', actorId: 'am-1' })).rejects.toBeInstanceOf(
      IntegrationSettingNotFoundError,
    );
  });
});

describe('ListIntegrationsUseCase', () => {
  it('returns one masked row per provider with resolution source', async () => {
    const repo = makeRepo({
      resend: {
        provider: 'resend',
        config: { apiKey: 're_1234abcd', fromEmail: 'no@x.com' },
        enabled: true,
        updatedById: 'am-1',
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    });
    const resolver = new IntegrationConfigResolver(repo, {
      mapbox: { accessToken: 'pk.envtoken1' },
    }, noopLogger);
    const useCase = new ListIntegrationsUseCase(repo, resolver);

    const rows = await useCase.execute();
    const byProvider = Object.fromEntries(rows.map((row) => [row.provider, row]));

    expect(byProvider['resend']).toMatchObject({
      configured: true,
      source: 'database',
      maskedConfig: { apiKey: '••••abcd', fromEmail: 'no@x.com' },
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(byProvider['mapbox']).toMatchObject({
      configured: true,
      source: 'env',
      maskedConfig: { accessToken: '••••ken1' },
      updatedAt: null,
    });
    expect(byProvider['mobile_message']).toMatchObject({ configured: false, source: 'none' });
    // No raw secret anywhere in the read model
    expect(JSON.stringify(rows)).not.toContain('re_1234abcd');
    expect(JSON.stringify(rows)).not.toContain('pk.envtoken1');
  });
});

describe('TestIntegrationConnectionUseCase', () => {
  it('reports unconfigured providers without calling the tester', async () => {
    const resolver = new IntegrationConfigResolver(makeRepo(), {}, noopLogger);
    const tester = { test: vi.fn() };
    const useCase = new TestIntegrationConnectionUseCase(resolver, tester);

    const result = await useCase.execute({ provider: 'resend' });
    expect(result.ok).toBe(false);
    expect(tester.test).not.toHaveBeenCalled();
  });

  it('delegates to the tester with resolved config and maps thrown errors to ok=false', async () => {
    const resolver = new IntegrationConfigResolver(makeRepo(), {
      mapbox: { accessToken: 'pk.t' },
    }, noopLogger);
    const tester = { test: vi.fn().mockRejectedValue(new Error('timeout')) };
    const useCase = new TestIntegrationConnectionUseCase(resolver, tester);

    const result = await useCase.execute({ provider: 'mapbox' });
    expect(tester.test).toHaveBeenCalledWith('mapbox', { accessToken: 'pk.t' });
    expect(result).toEqual({ ok: false, message: 'timeout' });
  });
});

describe('integration error codes', () => {
  it('IntegrationConfigInvalidError carries INTEGRATION_CONFIG_INVALID with status 400 and details', () => {
    const details = [{ field: 'apiKey', message: 'Required' }];
    const err = new IntegrationConfigInvalidError(details);
    expect(err.code).toBe('INTEGRATION_CONFIG_INVALID');
    expect(err.statusCode).toBe(400);
    expect(err.details).toBe(details);
  });
});
