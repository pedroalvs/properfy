import { describe, it, expect, vi } from 'vitest';
import { createPortalTokenMiddleware } from './portal-token-middleware';
import { RentalTenantPortalTokenEntity } from '../domain/rental-tenant-portal-token.entity';
import { PortalTokenRevokedError, PortalTokenSupersededError, PortalTokenInvalidError } from '../domain/rental-tenant-portal.errors';

function makeToken(status: string, expiresAt?: Date): RentalTenantPortalTokenEntity {
  return new RentalTenantPortalTokenEntity({
    id: 'token-1',
    appointmentId: 'appt-1',
    tokenHash: 'hash-abc',
    expiresAt: expiresAt ?? new Date(Date.now() + 86400000),
    status: status as any,
    usedAt: null,
    lastAccessedAt: null,
    rawTokenEncrypted: null,
    confirmationCycleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('portal-token-middleware', () => {
  it('should reject REVOKED tokens with PortalTokenRevokedError', async () => {
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(makeToken('REVOKED')),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' } } as any;

    await expect(middleware(request, {} as any)).rejects.toThrow(PortalTokenRevokedError);
  });

  it('should reject SUPERSEDED tokens with PortalTokenSupersededError', async () => {
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(makeToken('SUPERSEDED')),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' } } as any;

    await expect(middleware(request, {} as any)).rejects.toThrow(PortalTokenSupersededError);
  });

  it('should allow ACTIVE non-expired tokens through', async () => {
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(makeToken('ACTIVE')),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    await middleware(request, {} as any);
    expect(request.portalContext.isReadOnly).toBe(false);
  });

  it('should mark expired ACTIVE tokens as read-only and persist the EXPIRED status (#654)', async () => {
    const expired = makeToken('ACTIVE', new Date(Date.now() - 1000));
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(expired),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    await middleware(request, {} as any);
    expect(request.portalContext.isReadOnly).toBe(true);
    // The EXPIRED sync must actually be attempted, with the right arguments.
    expect(tokenRepo.updateStatus).toHaveBeenCalledWith('token-1', 'appt-1', 'EXPIRED');
  });

  it('stays read-only (never 500s) when the best-effort EXPIRED sync fails (#482)', async () => {
    const expired = makeToken('ACTIVE', new Date(Date.now() - 1000));
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(expired),
      updateStatus: vi.fn().mockRejectedValue(new Error('db down')),
    };
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r, logger as any);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    // The derived read-only view must survive a failed status sync; the 15-min
    // expire-tokens cron reconciles it later.
    await expect(middleware(request, {} as any)).resolves.toBeUndefined();
    expect(request.portalContext.isReadOnly).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should expose isPastConfirmCutoff=true for a valid token past its confirm cutoff', async () => {
    const token = makeToken('ACTIVE', new Date(Date.now() + 86400000));
    (token as any).confirmCutoffAt = new Date(Date.now() - 1000);
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(token),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    await middleware(request, {} as any);
    expect(request.portalContext.isPastConfirmCutoff).toBe(true);
    expect(request.portalContext.isReadOnly).toBe(false);
  });

  it('should expose isPastConfirmCutoff=false before the cutoff', async () => {
    const token = makeToken('ACTIVE', new Date(Date.now() + 86400000));
    (token as any).confirmCutoffAt = new Date(Date.now() + 3600000);
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(token),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    await middleware(request, {} as any);
    expect(request.portalContext.isPastConfirmCutoff).toBe(false);
  });

  it('should fall back to expiresAt for legacy tokens without confirmCutoffAt (expired → past cutoff)', async () => {
    const legacy = makeToken('ACTIVE', new Date(Date.now() - 1000));
    const tokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(legacy),
      updateStatus: vi.fn(),
    };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' }, portalContext: undefined } as any;

    await middleware(request, {} as any);
    expect(request.portalContext.isPastConfirmCutoff).toBe(true);
    expect(request.portalContext.isReadOnly).toBe(true);
  });

  it('should throw PortalTokenInvalidError when token not found', async () => {
    const tokenRepo = { findByTokenHash: vi.fn().mockResolvedValue(null), updateStatus: vi.fn() };
    const middleware = createPortalTokenMiddleware(tokenRepo as any, (r) => r);
    const request = { params: { token: 'raw-token' } } as any;

    await expect(middleware(request, {} as any)).rejects.toThrow(PortalTokenInvalidError);
  });
});
