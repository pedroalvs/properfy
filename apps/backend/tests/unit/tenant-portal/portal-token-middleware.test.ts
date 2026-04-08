import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createPortalTokenMiddleware } from '../../../src/modules/tenant-portal/interfaces/portal-token-middleware';
import { TenantPortalTokenEntity } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.entity';
import type { TenantPortalTokenProps } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.entity';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import { PortalTokenInvalidError, PortalTokenRevokedError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';

function makeTokenEntity(overrides: Partial<TenantPortalTokenProps> = {}): TenantPortalTokenEntity {
  return new TenantPortalTokenEntity({
    id: 'token-1',
    appointmentId: 'appt-1',
    tokenHash: 'hashed-abc123',
    expiresAt: new Date('2026-12-31'),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });
}

function makeRequest(params: Record<string, string> = {}): FastifyRequest {
  return { params } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  return {} as unknown as FastifyReply;
}

function makeTokenRepo(overrides: Partial<ITenantPortalTokenRepository> = {}): ITenantPortalTokenRepository {
  return {
    findByTokenHash: vi.fn().mockResolvedValue(null),
    findActiveByAppointmentId: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateLastAccessedAt: vi.fn().mockResolvedValue(undefined),
    markUsed: vi.fn().mockResolvedValue(undefined),
    revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
    expireActiveTokens: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('createPortalTokenMiddleware', () => {
  const hashToken = vi.fn((raw: string) => `hashed-${raw}`);
  let reply: FastifyReply;

  beforeEach(() => {
    vi.clearAllMocks();
    reply = makeReply();
  });

  it('sets portalContext with isReadOnly false for a valid active token', async () => {
    const entity = makeTokenEntity();
    const repo = makeTokenRepo({
      findByTokenHash: vi.fn().mockResolvedValue(entity),
    });
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({ token: 'abc123' });

    await middleware(request, reply);

    expect(hashToken).toHaveBeenCalledWith('abc123');
    expect(repo.findByTokenHash).toHaveBeenCalledWith('hashed-abc123');
    expect(request.portalContext).toEqual({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      tokenStatus: 'ACTIVE',
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('throws PortalTokenInvalidError when token is not found', async () => {
    const repo = makeTokenRepo();
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({ token: 'unknown' });

    await expect(middleware(request, reply)).rejects.toThrow(PortalTokenInvalidError);
  });

  it('throws PortalTokenRevokedError when token is revoked', async () => {
    const entity = makeTokenEntity({ status: 'REVOKED' });
    const repo = makeTokenRepo({
      findByTokenHash: vi.fn().mockResolvedValue(entity),
    });
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({ token: 'abc123' });

    await expect(middleware(request, reply)).rejects.toThrow(PortalTokenRevokedError);
  });

  it('sets portalContext with isReadOnly true for an already expired token', async () => {
    const entity = makeTokenEntity({
      status: 'EXPIRED',
      expiresAt: new Date('2025-01-01'),
    });
    const repo = makeTokenRepo({
      findByTokenHash: vi.fn().mockResolvedValue(entity),
    });
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({ token: 'abc123' });

    await middleware(request, reply);

    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(request.portalContext).toEqual({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: true,
      isUsed: false,
      tokenStatus: 'EXPIRED',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('performs lazy expiry when token is active but past expiresAt', async () => {
    const entity = makeTokenEntity({
      status: 'ACTIVE',
      expiresAt: new Date('2025-01-01'),
    });
    const repo = makeTokenRepo({
      findByTokenHash: vi.fn().mockResolvedValue(entity),
    });
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({ token: 'abc123' });

    await middleware(request, reply);

    expect(repo.updateStatus).toHaveBeenCalledWith('token-1', 'appt-1', 'EXPIRED');
    expect(request.portalContext).toEqual({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: true,
      isUsed: false,
      tokenStatus: 'EXPIRED',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('throws PortalTokenInvalidError when token param is missing', async () => {
    const repo = makeTokenRepo();
    const middleware = createPortalTokenMiddleware(repo, hashToken);
    const request = makeRequest({});

    await expect(middleware(request, reply)).rejects.toThrow(PortalTokenInvalidError);
  });
});
