import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ApiKey, IApiKeyRepository } from '../../../src/modules/integration/domain/api-key';
import { isApiKeyUsable } from '../../../src/modules/integration/domain/api-key';
import {
  CreateApiKeyUseCase,
  hashApiKey,
} from '../../../src/modules/integration/application/use-cases/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../../src/modules/integration/application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../../src/modules/integration/application/use-cases/revoke-api-key.use-case';
import { ApiKeyNotFoundError } from '../../../src/modules/integration/domain/integration.errors';
import { createApiKeyAuthMiddleware } from '../../../src/shared/interfaces/api-key-auth-middleware';
import { UnauthorizedError } from '../../../src/shared/domain/errors';

const auditService = { log: vi.fn() } as any;

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'k-1',
    name: 'n8n',
    keyHash: 'hash',
    prefix: 'pfy_ab12cd34',
    role: 'OP',
    scopes: [],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdById: 'am-1',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(): IApiKeyRepository & { rows: Map<string, ApiKey> } {
  const rows = new Map<string, ApiKey>();
  return {
    rows,
    create: vi.fn(async (data) => {
      const key = makeKey({ id: `k-${rows.size + 1}`, ...data });
      rows.set(key.id, key);
      return key;
    }),
    list: vi.fn(async () => [...rows.values()]),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
    findByHash: vi.fn(async (hash) => [...rows.values()].find((k) => k.keyHash === hash) ?? null),
    revoke: vi.fn(async (id) => {
      const key = rows.get(id);
      if (key) rows.set(id, { ...key, revokedAt: new Date() });
    }),
    touchLastUsed: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateApiKeyUseCase', () => {
  it('returns the plaintext key once, stores only its hash, audits without secrets', async () => {
    const repo = makeRepo();
    const useCase = new CreateApiKeyUseCase(repo, auditService);

    const created = await useCase.execute({ name: 'n8n', role: 'OP', expiresAt: null, actorId: 'am-1' });

    expect(created.key).toMatch(/^pfy_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.key.slice(0, 12));
    const stored = [...repo.rows.values()][0];
    expect(stored.keyHash).toBe(hashApiKey(created.key));
    expect(stored.keyHash).not.toContain(created.key);
    expect(JSON.stringify(auditService.log.mock.calls[0][0])).not.toContain(created.key);
    // response shape never carries the hash
    expect(created).not.toHaveProperty('keyHash');
  });

  it('generates unique keys', async () => {
    const repo = makeRepo();
    const useCase = new CreateApiKeyUseCase(repo, auditService);
    const a = await useCase.execute({ name: 'a', role: 'OP', expiresAt: null, actorId: 'am-1' });
    const b = await useCase.execute({ name: 'b', role: 'AM', expiresAt: null, actorId: 'am-1' });
    expect(a.key).not.toBe(b.key);
  });
});

describe('ListApiKeysUseCase', () => {
  it('never exposes hashes', async () => {
    const repo = makeRepo();
    repo.rows.set('k-1', makeKey());
    const list = await new ListApiKeysUseCase(repo).execute();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('hash');
  });
});

describe('RevokeApiKeyUseCase', () => {
  it('revokes and audits; is idempotent', async () => {
    const repo = makeRepo();
    repo.rows.set('k-1', makeKey());
    const useCase = new RevokeApiKeyUseCase(repo, auditService);

    const revoked = await useCase.execute({ id: 'k-1', actorId: 'am-1' });
    expect(revoked.revokedAt).not.toBeNull();
    expect(auditService.log).toHaveBeenCalledTimes(1);

    await useCase.execute({ id: 'k-1', actorId: 'am-1' });
    expect(repo.revoke).toHaveBeenCalledTimes(1);
  });

  it('throws for an unknown id', async () => {
    const useCase = new RevokeApiKeyUseCase(makeRepo(), auditService);
    await expect(useCase.execute({ id: 'nope', actorId: 'am-1' })).rejects.toBeInstanceOf(
      ApiKeyNotFoundError,
    );
  });
});

describe('isApiKeyUsable', () => {
  const now = new Date('2026-07-07T00:00:00Z');
  it('rejects revoked and expired keys', () => {
    expect(isApiKeyUsable(makeKey(), now)).toBe(true);
    expect(isApiKeyUsable(makeKey({ revokedAt: new Date() }), now)).toBe(false);
    expect(isApiKeyUsable(makeKey({ expiresAt: new Date('2026-07-06T00:00:00Z') }), now)).toBe(false);
    expect(isApiKeyUsable(makeKey({ expiresAt: new Date('2026-07-08T00:00:00Z') }), now)).toBe(true);
  });
});

describe('createApiKeyAuthMiddleware', () => {
  const jwtAuth = vi.fn(async () => {});

  function makeRequest(headers: Record<string, string>) {
    return { headers, authContext: undefined } as any;
  }

  it('delegates to JWT auth when no X-API-Key header is present', async () => {
    const middleware = createApiKeyAuthMiddleware(makeRepo(), jwtAuth);
    const request = makeRequest({});
    await middleware(request, {} as any);
    expect(jwtAuth).toHaveBeenCalled();
  });

  it('authenticates a valid key as a machine principal with the key role', async () => {
    const repo = makeRepo();
    const useCase = new CreateApiKeyUseCase(repo, auditService);
    const created = await useCase.execute({ name: 'n8n', role: 'OP', expiresAt: null, actorId: 'am-1' });

    const middleware = createApiKeyAuthMiddleware(repo, jwtAuth);
    const request = makeRequest({ 'x-api-key': created.key });
    await middleware(request, {} as any);

    expect(request.authContext).toMatchObject({
      userId: `api-key:${created.id}`,
      tenantId: null,
      role: 'OP',
    });
    expect(jwtAuth).not.toHaveBeenCalled();
    expect(repo.touchLastUsed).toHaveBeenCalled();
  });

  it('rejects unknown, revoked and expired keys with 401 (no JWT fallback)', async () => {
    const repo = makeRepo();
    const useCase = new CreateApiKeyUseCase(repo, auditService);
    const created = await useCase.execute({ name: 'n8n', role: 'OP', expiresAt: null, actorId: 'am-1' });
    const middleware = createApiKeyAuthMiddleware(repo, jwtAuth);

    await expect(
      middleware(makeRequest({ 'x-api-key': 'pfy_bogus' }), {} as any),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await new RevokeApiKeyUseCase(repo, auditService).execute({ id: created.id, actorId: 'am-1' });
    await expect(
      middleware(makeRequest({ 'x-api-key': created.key }), {} as any),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(jwtAuth).not.toHaveBeenCalled();
  });

  it('throttles last_used_at updates', async () => {
    const repo = makeRepo();
    const useCase = new CreateApiKeyUseCase(repo, auditService);
    const created = await useCase.execute({ name: 'n8n', role: 'OP', expiresAt: null, actorId: 'am-1' });
    // Simulate a very recent use
    const stored = [...repo.rows.values()][0];
    repo.rows.set(stored.id, { ...stored, lastUsedAt: new Date() });

    const middleware = createApiKeyAuthMiddleware(repo, jwtAuth);
    await middleware(makeRequest({ 'x-api-key': created.key }), {} as any);
    expect(repo.touchLastUsed).not.toHaveBeenCalled();
  });
});
