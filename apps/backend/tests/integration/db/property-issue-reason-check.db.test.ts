/**
 * Defense-in-depth: the `property_issues.reason` length bound (1..1000) must be
 * enforced by a DB CHECK constraint, not only by Zod (F10-1 spec line 102:
 * `reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000)`).
 *
 * These raw-SQL inserts bypass the application layer entirely, so they prove the
 * constraint lives in the database. A mocked Prisma cannot prove this.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */
import type { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness | undefined;
let prisma: PrismaClient;

const suffix = () => Math.random().toString(36).slice(2, 10);

async function createTenantWithProperty(): Promise<{ tenantId: string; propertyId: string }> {
  const name = `Reason Check ${suffix()}`;
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} ${suffix()}`, status: 'ACTIVE' },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      property_code: `RC-${suffix()}`,
      type: 'HOUSE',
      street: '1 Test St',
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'PENDING',
    },
  });
  return { tenantId: tenant.id, propertyId: property.id };
}

/** Raw insert of a property_issues row with the given reason, bypassing Zod. */
async function insertIssueWithReason(
  tenantId: string,
  propertyId: string,
  reason: string,
): Promise<void> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "property_issues"
      ("id", "tenant_id", "property_id", "reason", "source", "created_at", "updated_at")
    VALUES
      (${id}, ${tenantId}, ${propertyId}, ${reason}, 'STAFF'::"PropertyIssueSource", NOW(), NOW())
  `;
}

describe('property_issues.reason DB CHECK constraint', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
  }, 120_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('rejects a reason longer than 1000 characters', async () => {
    const { tenantId, propertyId } = await createTenantWithProperty();
    await expect(
      insertIssueWithReason(tenantId, propertyId, 'a'.repeat(1001)),
    ).rejects.toThrow();
  });

  it('rejects an empty reason', async () => {
    const { tenantId, propertyId } = await createTenantWithProperty();
    await expect(
      insertIssueWithReason(tenantId, propertyId, ''),
    ).rejects.toThrow();
  });

  it('accepts a reason at the 1000-character boundary', async () => {
    const { tenantId, propertyId } = await createTenantWithProperty();
    await expect(
      insertIssueWithReason(tenantId, propertyId, 'a'.repeat(1000)),
    ).resolves.not.toThrow();
  });

  it('accepts a single-character reason', async () => {
    const { tenantId, propertyId } = await createTenantWithProperty();
    await expect(
      insertIssueWithReason(tenantId, propertyId, 'x'),
    ).resolves.not.toThrow();
  });
});
