/**
 * Real-DB proof that portal token consumption is atomic.
 *
 * Two concurrent `tryClaim` calls on the same token must resolve with exactly
 * one winner — the conditional `updateMany({ where: { id, used_at: null } })`
 * is the single source of truth, closing the TOCTOU race that the old
 * check-then-`markUsed` flow left open.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';

let harness: DbHarness;
let repo: PrismaRentalTenantPortalTokenRepository;
let appointmentId: string;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
  const fixture = await seedLegacyDoneAppointment(harness.prisma);
  appointmentId = fixture.appointmentId;
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function createToken(): Promise<string> {
  const token = await harness.prisma.rentalTenantPortalToken.create({
    data: {
      appointment_id: appointmentId,
      token_hash: `claim-test-${Math.random().toString(36).slice(2, 12)}`,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  return token.id;
}

describe('PrismaRentalTenantPortalTokenRepository.tryClaim', () => {
  it('lets exactly one of two concurrent claims win', async () => {
    const tokenId = await createToken();

    const results = await Promise.all([repo.tryClaim(tokenId), repo.tryClaim(tokenId)]);

    expect(results.filter((won) => won)).toHaveLength(1);
    expect(results.filter((won) => !won)).toHaveLength(1);

    const row = await harness.prisma.rentalTenantPortalToken.findUnique({ where: { id: tokenId } });
    expect(row?.used_at).not.toBeNull();
  });

  it('returns false for a token that was already claimed', async () => {
    const tokenId = await createToken();

    await expect(repo.tryClaim(tokenId)).resolves.toBe(true);
    await expect(repo.tryClaim(tokenId)).resolves.toBe(false);
  });

  it('returns false for a non-existent token id', async () => {
    await expect(repo.tryClaim('00000000-0000-0000-0000-000000000000')).resolves.toBe(false);
  });

  it('releaseClaim reopens the token so a new claim succeeds', async () => {
    const tokenId = await createToken();

    await expect(repo.tryClaim(tokenId)).resolves.toBe(true);
    await repo.releaseClaim(tokenId);

    const row = await harness.prisma.rentalTenantPortalToken.findUnique({ where: { id: tokenId } });
    expect(row?.used_at).toBeNull();

    await expect(repo.tryClaim(tokenId)).resolves.toBe(true);
  });
});
