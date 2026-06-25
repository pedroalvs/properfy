import { describe, it, expect, vi } from 'vitest';
import { PrismaTenantPortalTokenRepository } from '../prisma-tenant-portal-token.repository';

/**
 * Unit tests for PrismaTenantPortalTokenRepository.findActiveByAppointmentId (T021)
 *
 * Verifies that the method:
 * - Returns null when no ACTIVE token exists
 * - Returns null when the only ACTIVE token has expires_at <= now() (expiry fix CQ-2)
 * - Returns the entity when expires_at > now()
 *
 * Per spec §3.B2 CQ-2, Regras invariant B.1: active token = status='ACTIVE' AND expires_at > now().
 */

function makePrismaRow(opts: {
  status?: string;
  expiresAt?: Date;
} = {}): Record<string, unknown> {
  return {
    id: 'token-1',
    appointment_id: 'appt-1',
    token_hash: 'hash-abc',
    expires_at: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
    status: opts.status ?? 'ACTIVE',
    used_at: null,
    last_accessed_at: null,
    raw_token_encrypted: 'encrypted',
    confirmation_cycle_id: 'cycle-1',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('PrismaTenantPortalTokenRepository.findActiveByAppointmentId', () => {
  it('should return null when no ACTIVE token exists for the appointment', async () => {
    const prisma = {
      tenantPortalToken: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const repo = new PrismaTenantPortalTokenRepository(prisma);

    const result = await repo.findActiveByAppointmentId('appt-1');

    expect(result).toBeNull();
  });

  it('should return null when the only ACTIVE token has expires_at <= now() [expiry check CQ-2]', async () => {
    // expires_at in the PAST — should be excluded even though status is ACTIVE
    const expiredAt = new Date(Date.now() - 1); // 1ms ago
    const prisma = {
      tenantPortalToken: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
          // Simulate DB behavior: only return the row if the expiry predicate would match
          // Without the expiry fix, the WHERE clause is { appointment_id, status='ACTIVE' }
          // and would return this expired token. With the fix, the WHERE clause includes
          // expires_at: { gt: <now> } and would return null.
          const hasExpiryFilter = where?.expires_at?.gt !== undefined;
          if (!hasExpiryFilter) {
            // Old behavior: returns expired token (no expiry check)
            return Promise.resolve(makePrismaRow({ expiresAt: expiredAt }));
          }
          // New behavior: would filter by expiry, returning null for expired row
          const filterDate: Date = where.expires_at.gt;
          if (expiredAt > filterDate) {
            return Promise.resolve(makePrismaRow({ expiresAt: expiredAt }));
          }
          return Promise.resolve(null);
        }),
      },
    } as any;
    const repo = new PrismaTenantPortalTokenRepository(prisma);

    const result = await repo.findActiveByAppointmentId('appt-1');

    // With the CQ-2 fix: result should be null (expired token excluded)
    expect(result).toBeNull();
  });

  it('should return entity when ACTIVE token has expires_at > now()', async () => {
    const futureExpiry = new Date(Date.now() + 3_600_000); // 1 hour from now
    const tokenRow = makePrismaRow({ expiresAt: futureExpiry });
    const prisma = {
      tenantPortalToken: { findFirst: vi.fn().mockResolvedValue(tokenRow) },
    } as any;
    const repo = new PrismaTenantPortalTokenRepository(prisma);

    const result = await repo.findActiveByAppointmentId('appt-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('ACTIVE');
    expect(result!.expiresAt.getTime()).toBeCloseTo(futureExpiry.getTime(), -2);
  });

  it('should include expires_at > now() predicate in the WHERE clause', async () => {
    const prisma = {
      tenantPortalToken: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const repo = new PrismaTenantPortalTokenRepository(prisma);

    const before = new Date();
    await repo.findActiveByAppointmentId('appt-1');
    const after = new Date();

    expect(prisma.tenantPortalToken.findFirst).toHaveBeenCalledOnce();
    const callArgs = prisma.tenantPortalToken.findFirst.mock.calls[0][0];

    // The WHERE clause MUST include an expires_at > <now> predicate
    expect(callArgs.where).toMatchObject({
      appointment_id: 'appt-1',
      status: 'ACTIVE',
      expires_at: { gt: expect.any(Date) },
    });

    // The date used must be between before/after to confirm Node-clock authority (AC-2.5)
    const usedDate: Date = callArgs.where.expires_at.gt;
    expect(usedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(usedDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
