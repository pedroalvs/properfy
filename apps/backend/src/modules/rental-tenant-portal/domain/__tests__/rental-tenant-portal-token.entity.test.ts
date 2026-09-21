import { describe, it, expect } from 'vitest';
import { RentalTenantPortalTokenEntity } from '../rental-tenant-portal-token.entity';

function makeToken(overrides: Partial<ConstructorParameters<typeof RentalTenantPortalTokenEntity>[0]> = {}) {
  return new RentalTenantPortalTokenEntity({
    id: 'token-1',
    appointmentId: 'appt-1',
    tokenHash: 'hash',
    expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    confirmCutoffAt: new Date('2026-05-31T00:00:00.000Z'),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('RentalTenantPortalTokenEntity.isExpired (WI-B5 / #656)', () => {
  const expiresAt = new Date('2026-06-01T00:00:00.000Z');

  it('is expired AT the exact deadline instant (inclusive, matches repo expires_at > now)', () => {
    const token = makeToken({ expiresAt });
    expect(token.isExpired(new Date(expiresAt.getTime()))).toBe(true);
  });

  it('is not expired one millisecond before the deadline', () => {
    const token = makeToken({ expiresAt });
    expect(token.isExpired(new Date(expiresAt.getTime() - 1))).toBe(false);
  });

  it('is expired after the deadline', () => {
    const token = makeToken({ expiresAt });
    expect(token.isExpired(new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});

describe('RentalTenantPortalTokenEntity.isPastConfirmCutoff (WI-B5 symmetry)', () => {
  const cutoff = new Date('2026-05-31T00:00:00.000Z');

  it('is past the cutoff AT the exact cutoff instant (inclusive)', () => {
    const token = makeToken({ confirmCutoffAt: cutoff });
    expect(token.isPastConfirmCutoff(new Date(cutoff.getTime()))).toBe(true);
  });

  it('is not past the cutoff one millisecond before', () => {
    const token = makeToken({ confirmCutoffAt: cutoff });
    expect(token.isPastConfirmCutoff(new Date(cutoff.getTime() - 1))).toBe(false);
  });

  it('falls back to expiresAt for legacy rows with no cutoff', () => {
    const expiresAt = new Date('2026-06-01T00:00:00.000Z');
    const token = makeToken({ confirmCutoffAt: null, expiresAt });
    expect(token.isPastConfirmCutoff(new Date(expiresAt.getTime()))).toBe(true);
  });
});
