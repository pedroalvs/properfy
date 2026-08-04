import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    appointment_id: 'appointment-1',
    token_hash: 'hash',
    expires_at: new Date('2026-08-03T13:00:00.000Z'),
    confirm_cutoff_at: new Date('2026-08-02T09:00:00.000Z'),
    status: 'EXPIRED',
    used_at: new Date('2026-08-01T00:00:00.000Z'),
    last_accessed_at: null,
    raw_token_encrypted: 'encrypted',
    confirmation_cycle_id: null,
    created_at: new Date('2026-07-20T00:00:00.000Z'),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('portal token extension', () => {
  const prisma = {
    rentalTenantPortalToken: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  };
  const repo = new PrismaRentalTenantPortalTokenRepository(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findLatestExtendableByAppointmentId', () => {
    it('returns the newest token that can still be opened', async () => {
      prisma.rentalTenantPortalToken.findFirst.mockResolvedValue(makeRow());

      const result = await repo.findLatestExtendableByAppointmentId('appointment-1');

      expect(result?.id).toBe('token-1');
      const [args] = prisma.rentalTenantPortalToken.findFirst.mock.calls[0];
      expect(args).toMatchObject({
        where: { appointment_id: 'appointment-1', status: { in: ['ACTIVE', 'EXPIRED'] } },
        orderBy: { created_at: 'desc' },
      });
    });

    it('excludes REVOKED and SUPERSEDED tokens', async () => {
      // The middleware hard-rejects SUPERSEDED with 410, so extending one would
      // produce a link that can never be opened — worse than sending nothing.
      await repo.findLatestExtendableByAppointmentId('appointment-1');

      const [args] = prisma.rentalTenantPortalToken.findFirst.mock.calls[0];
      expect(args.where.status.in).not.toContain('SUPERSEDED');
      expect(args.where.status.in).not.toContain('REVOKED');
    });

    it('returns null when the appointment never had a portal token', async () => {
      prisma.rentalTenantPortalToken.findFirst.mockResolvedValue(null);

      expect(await repo.findLatestExtendableByAppointmentId('appointment-1')).toBeNull();
    });
  });

  describe('extendExpiryAndReactivate', () => {
    it('reports whether a row was updated', async () => {
      prisma.$executeRaw.mockResolvedValue(1);

      const updated = await repo.extendExpiryAndReactivate(
        'token-1',
        'appointment-1',
        new Date('2026-08-17T00:00:00.000Z'),
      );

      expect(updated).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('reports false when the token no longer qualifies', async () => {
      // Raced by the expiry worker or revoked in between: the conditional WHERE
      // matched nothing, and the caller must not claim it extended anything.
      prisma.$executeRaw.mockResolvedValue(0);

      expect(
        await repo.extendExpiryAndReactivate('token-1', 'appointment-1', new Date()),
      ).toBe(false);
    });

    it('issues a single conditional statement rather than reading then writing', async () => {
      // Read-modify-write would race the expire-tokens worker: it could flip the
      // token to EXPIRED between our read and our write, and we would overwrite
      // that with a stale status.
      prisma.$executeRaw.mockResolvedValue(1);

      await repo.extendExpiryAndReactivate('token-1', 'appointment-1', new Date());

      expect(prisma.rentalTenantPortalToken.findFirst).not.toHaveBeenCalled();

      const sql = prisma.$executeRaw.mock.calls[0][0].join('?');
      // GREATEST keeps replays from ever shrinking the window.
      expect(sql).toContain('GREATEST');
      // Only EXPIRED is revived; an ACTIVE token keeps its status.
      expect(sql).toContain('CASE');
      // confirm_cutoff_at is never touched, so confirming stays closed.
      expect(sql).not.toContain('confirm_cutoff_at');
    });
  });
});
