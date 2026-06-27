/**
 * Real-database integration tests for the two DB-level guarantees introduced
 * with the configurable appointment-code prefix and the sequential group code:
 *
 *   1. `tenants.appointment_code_prefix` is UNIQUE (case-insensitive via uppercase
 *      normalization on write). A concurrent/duplicate write that slips past the
 *      application pre-check still surfaces a domain conflict (Prisma P2002 →
 *      TenantAppointmentCodePrefixConflictError) instead of a raw 500.
 *   2. `service_groups.group_number` is a global auto-increment sequence — each
 *      saved group gets a distinct, ascending number the repository surfaces back
 *      onto the entity.
 *
 * These cannot be exercised with mocks (a mocked repo returns regardless of args),
 * so they run against a real Postgres container.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { TenantAppointmentCodePrefixConflictError } from '../../../src/modules/tenant/domain/tenant.errors';

function makeTenant(prefix: string | null, suffix: string): TenantEntity {
  return new TenantEntity({
    id: randomUUID(),
    name: 'Prefix Test Agency',
    legalName: `Prefix Test Agency ${suffix}`,
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    appointmentCodePrefix: prefix,
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeGroup(serviceTypeId: string, createdByUserId: string): ServiceGroupEntity {
  const now = new Date();
  return new ServiceGroupEntity({
    id: randomUUID(),
    serviceTypeId,
    status: 'DRAFT',
    groupSize: 1,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2030-01-15'),
    timeWindow: '09:00-12:00',
    name: null,
    regionName: null,
    description: null,
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    assignedInspectorId: null,
    serviceRegionId: null,
    publishedAt: null,
    assignedAt: null,
    createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
}

describe('Tenant appointment_code_prefix + ServiceGroup group_number (real DB)', () => {
  let harness: DbHarness;
  let tenantRepo: PrismaTenantRepository;
  let groupRepo: PrismaServiceGroupRepository;

  beforeAll(async () => {
    harness = await setupDbHarness();
    tenantRepo = new PrismaTenantRepository(harness.prisma);
    groupRepo = new PrismaServiceGroupRepository(harness.prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists the prefix and finds the tenant by prefix', async () => {
    const tenant = makeTenant('ABC', randomUUID());
    await tenantRepo.save(tenant);

    const found = await tenantRepo.findByAppointmentCodePrefix('ABC');
    expect(found?.id).toBe(tenant.id);
    expect(found?.appointmentCodePrefix).toBe('ABC');
  });

  it('rejects a duplicate prefix with a domain conflict error (DB unique + P2002)', async () => {
    await tenantRepo.save(makeTenant('DUP', randomUUID()));

    await expect(
      tenantRepo.save(makeTenant('DUP', randomUUID())),
    ).rejects.toBeInstanceOf(TenantAppointmentCodePrefixConflictError);
  });

  it('allows multiple tenants with a NULL prefix (legacy rows)', async () => {
    await tenantRepo.save(makeTenant(null, randomUUID()));
    await expect(
      tenantRepo.save(makeTenant(null, randomUUID())),
    ).resolves.toBeUndefined();
  });

  it('rejects a lowercase prefix at the DB level (CHECK constraint enforces uppercase)', async () => {
    // The repo does not normalize (the use case does); a direct write of a
    // mixed-case prefix must be rejected by the specific uppercase CHECK so the
    // case-insensitive uniqueness contract cannot be bypassed.
    await expect(tenantRepo.save(makeTenant('abc', randomUUID()))).rejects.toThrow(
      /tenants_appointment_code_prefix_format|check constraint/i,
    );
  });

  it('assigns a distinct, ascending group_number from a GLOBAL sequence across tenants', async () => {
    // Two independent fixtures (different tenants/service types) prove the
    // sequence is global, not just increasing within one group of inserts.
    const fixtureA = await seedLegacyDoneAppointment(harness.prisma, {
      tenantName: `Group Seq A ${randomUUID().slice(0, 8)}`,
    });
    const fixtureB = await seedLegacyDoneAppointment(harness.prisma, {
      tenantName: `Group Seq B ${randomUUID().slice(0, 8)}`,
    });

    const gA = makeGroup(fixtureA.serviceTypeId, fixtureA.userId);
    await groupRepo.save(gA);
    const gB = makeGroup(fixtureB.serviceTypeId, fixtureB.userId);
    await groupRepo.save(gB);

    expect(gA.groupNumber).toBeGreaterThan(0);
    // gB belongs to a different tenant yet still gets the next global number.
    expect(gB.groupNumber).toBeGreaterThan(gA.groupNumber);
  });
});
