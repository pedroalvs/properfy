/**
 * Real-database proof that INGOING/OUTGOING appointments are grouped and
 * published on creation, and that every way it can go wrong still leaves the
 * operator something to repair.
 *
 * Requires Docker (testcontainers) + PostGIS, like the other db/ tests.
 * Single target run:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/auto-group-ingoing-outgoing.integration.test.ts
 *
 * The unit tests mock the two service-group use cases; this file wires the real
 * ones so the spatial region match, the status cascade, the group row and the
 * audit trail are all exercised against Postgres.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  SYDNEY_POLYGON_GEOJSON,
  SYDNEY_EAST_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
  POINT_OUTSIDE_SYDNEY,
  POINT_INSIDE_OVERLAP,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';
import { PrismaBranchRepository } from '../../../src/modules/tenant/infrastructure/prisma-branch.repository';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PrismaServiceTypeRepository } from '../../../src/modules/service-type/infrastructure/prisma-service-type.repository';
import { PrismaPricingRuleRepository } from '../../../src/modules/pricing-rule/infrastructure/prisma-pricing-rule.repository';
import { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import { PublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/publish-service-group.use-case';
import { AutoGroupIngoingOutgoingService } from '../../../src/modules/service-group/application/services/auto-group-ingoing-outgoing.service';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import type { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { futureDateStr } from '../../helpers/date-fixtures';

let harness: DbHarness;
let createAppointment: CreateAppointmentUseCase;
let auditEntries: Array<{ action: string; actorType?: string; metadata?: Record<string, unknown> }>;

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger;

beforeAll(async () => {
  harness = await setupDbHarness();
  const prisma = harness.prisma;

  auditEntries = [];
  // Captured in-memory rather than asserted through the audit_logs table: the
  // real AuditService writes asynchronously, and these assertions are about
  // which entries the use cases emit, not about audit persistence.
  const auditService = {
    log: (entry: { action: string; actorType?: string; metadata?: Record<string, unknown> }) => {
      auditEntries.push(entry);
    },
  } as unknown as AuditService;

  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
  const serviceRegionRepo = new PrismaServiceRegionRepository(prisma);
  const authorizationService = new AuthorizationService(auditService);

  const autoGroupService = new AutoGroupIngoingOutgoingService(
    new CreateServiceGroupUseCase(
      serviceGroupRepo, appointmentRepo, auditService, authorizationService, serviceRegionRepo, undefined, noopLogger,
    ),
    new PublishServiceGroupUseCase(serviceGroupRepo, auditService, serviceRegionRepo, authorizationService),
    serviceRegionRepo,
    auditService,
    noopLogger,
  );

  createAppointment = new CreateAppointmentUseCase(
    appointmentRepo,
    new PrismaBranchRepository(prisma),
    new PrismaPropertyRepository(prisma),
    new PrismaServiceTypeRepository(prisma),
    new PrismaPricingRuleRepository(prisma),
    {} as CreatePropertyUseCase,
    auditService,
    authorizationService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    autoGroupService,
  );
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

// Regions accumulate across tests and they all cover the same Sydney point, so
// without this every test after the first would also match its predecessors'
// polygons. Deactivating rather than deleting keeps the service_groups FK
// intact, and resolveRegionsForAppointments already filters on status = ACTIVE.
beforeEach(async () => {
  await harness.prisma.$executeRaw`UPDATE service_regions SET status = 'INACTIVE'::"RegionStatus"`;
});

// --- seeding -----------------------------------------------------------------

async function seedServiceType(prisma: PrismaClient, flowType: 'ROUTINE' | 'INGOING' | 'OUTGOING'): Promise<string> {
  const suffix = rand();
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${suffix}`,
      name: `${flowType} ${suffix}`,
      flow_type: flowType,
      requires_rental_tenant_confirmation: false,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

async function seedRegion(
  prisma: PrismaClient,
  name: string,
  geojson: Record<string, unknown>,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<string> {
  const regionId = crypto.randomUUID();
  const geojsonStr = JSON.stringify(geojson);
  await prisma.$executeRaw`
    INSERT INTO service_regions (id, tenant_id, name, geom, geojson, color, status, created_at, updated_at)
    VALUES (
      ${regionId}, NULL, ${name},
      ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
      ${geojsonStr}::jsonb, '#3b82f6', ${status}::"RegionStatus", NOW(), NOW()
    )
  `;
  return regionId;
}

/** `point: null` seeds a property with no coordinates — the ungeocoded case. */
async function seedProperty(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  point: { lng: number; lat: number } | null,
): Promise<string> {
  const coordinates = point
    ? await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}, ${branchId}, ${'P-' + rand()}, 'HOUSE', '1 Test St', 'Sydney', '2000', 'NSW', 'AU', 'SUCCESS',
                ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326), NOW(), NOW())
        RETURNING id`
    : await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}, ${branchId}, ${'P-' + rand()}, 'HOUSE', '1 Test St', 'Sydney', '2000', 'NSW', 'AU', 'PENDING',
                NULL, NOW(), NOW())
        RETURNING id`;
  return coordinates[0].id;
}

async function seedPricingRule(prisma: PrismaClient, tenantId: string, serviceTypeId: string): Promise<void> {
  await prisma.servicePriceRule.create({
    data: {
      tenant_id: tenantId,
      service_type_id: serviceTypeId,
      branch_id: null,
      currency: 'AUD',
      price_amount: 150,
      payout_type: 'FIXED',
      payout_value: 80,
      status: 'ACTIVE',
    },
  });
}

interface Scenario {
  tenantId: string;
  userId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  actor: AuthContext;
}

async function setupScenario(opts: {
  flowType: 'ROUTINE' | 'INGOING' | 'OUTGOING';
  point?: { lng: number; lat: number } | null;
  role?: AuthContext['role'];
}): Promise<Scenario> {
  const prisma = harness.prisma;
  const { tenantId, userId } = await seedTenant(prisma, `Agency ${rand()}`);
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('seedTenant did not create a branch');

  const serviceTypeId = await seedServiceType(prisma, opts.flowType);
  await seedPricingRule(prisma, tenantId, serviceTypeId);
  const propertyId = await seedProperty(
    prisma,
    tenantId,
    branch.id,
    opts.point === undefined ? POINT_INSIDE_SYDNEY : opts.point,
  );

  return {
    tenantId,
    userId,
    branchId: branch.id,
    propertyId,
    serviceTypeId,
    actor: {
      userId,
      tenantId,
      role: opts.role ?? 'CL_ADMIN',
      branchId: null,
      inspectorId: null,
    } as AuthContext,
  };
}

function createInput(s: Scenario, overrides: Record<string, unknown> = {}) {
  return {
    branchId: s.branchId,
    propertyId: s.propertyId,
    serviceTypeId: s.serviceTypeId,
    scheduledDate: futureDateStr(30),
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    keyRequired: false,
    actor: s.actor,
    ...overrides,
  } as Parameters<CreateAppointmentUseCase['execute']>[0];
}

async function readGroup(groupId: string) {
  return harness.prisma.serviceGroup.findUnique({ where: { id: groupId } });
}

// --- tests -------------------------------------------------------------------

describe('auto-group on creation', () => {
  it.each(['INGOING', 'OUTGOING'] as const)(
    'publishes a one-appointment group for %s',
    async (flowType) => {
      const s = await setupScenario({ flowType });
      await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

      const result = await createAppointment.execute(createInput(s));

      expect(result.status).toBe('AWAITING_INSPECTOR');
      expect(result.serviceGroupId).not.toBeNull();

      const group = await readGroup(result.serviceGroupId!);
      expect(group?.status).toBe('PUBLISHED');
      expect(group?.published_at).not.toBeNull();
      expect(group?.offered_count).toBe(1);
      expect(group?.time_window).toBe('09:00-11:00');
      expect(group?.service_region_id).not.toBeNull();
      expect(group?.service_type_id).toBe(s.serviceTypeId);

      const appointment = await harness.prisma.appointment.findUnique({ where: { id: result.id } });
      expect(appointment?.status).toBe('AWAITING_INSPECTOR');
      expect(appointment?.service_group_id).toBe(group?.id);
    },
  );

  it('leaves ROUTINE untouched', async () => {
    const s = await setupScenario({ flowType: 'ROUTINE' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

    const result = await createAppointment.execute(createInput(s));

    expect(result.status).toBe('DRAFT');
    expect(result.serviceGroupId).toBeNull();

    const appointment = await harness.prisma.appointment.findUnique({ where: { id: result.id } });
    expect(appointment?.service_group_id).toBeNull();
  });

  // The group's window is the appointment's own slot, so the create-time
  // schedule sync must be a no-op — an appointment.updated entry here would
  // mean we are rewriting the slot we just set.
  it('does not rewrite the appointment schedule it just created', async () => {
    const s = await setupScenario({ flowType: 'INGOING' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);
    auditEntries.length = 0;

    await createAppointment.execute(createInput(s));

    expect(auditEntries.map((e) => e.action)).not.toContain('appointment.updated');
  });

  it('records the group audit entries as SYSTEM', async () => {
    const s = await setupScenario({ flowType: 'INGOING' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);
    auditEntries.length = 0;

    await createAppointment.execute(createInput(s));

    const actions = auditEntries.map((e) => e.action);
    expect(actions).toContain('service_group.created');
    expect(actions).toContain('service_group.published');
    expect(actions).toContain('appointment.status_transition');
    for (const action of ['service_group.created', 'service_group.published']) {
      expect(auditEntries.find((e) => e.action === action)?.actorType).toBe('SYSTEM');
    }
  });

  // created_by_user_id is an FK to users, so a synthetic SYSTEM principal would
  // fail the insert outright. This is the regression test for that.
  it('files the group under the real creating user, not a synthetic one', async () => {
    const s = await setupScenario({ flowType: 'INGOING', role: 'CL_ADMIN' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

    const result = await createAppointment.execute(createInput(s));

    const group = await readGroup(result.serviceGroupId!);
    expect(group?.created_by_user_id).toBe(s.userId);
  });

  it('gives two appointments on the same property two separate groups', async () => {
    const s = await setupScenario({ flowType: 'INGOING' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

    const first = await createAppointment.execute(createInput(s));
    const second = await createAppointment.execute(createInput(s));

    expect(first.serviceGroupId).not.toBe(second.serviceGroupId);
    for (const groupId of [first.serviceGroupId!, second.serviceGroupId!]) {
      const members = await harness.prisma.appointment.count({ where: { service_group_id: groupId } });
      expect(members).toBe(1);
    }
  });
});

describe('auto-group falls back to DRAFT', () => {
  async function expectDraft(s: Scenario) {
    const result = await createAppointment.execute(createInput(s));

    expect(result.status).toBe('AWAITING_INSPECTOR');
    expect(result.serviceGroupId).not.toBeNull();

    const group = await readGroup(result.serviceGroupId!);
    expect(group?.status).toBe('DRAFT');
    expect(group?.published_at).toBeNull();
    expect(group?.service_region_id).toBeNull();
    return result;
  }

  it('when the property has no coordinates yet', async () => {
    const s = await setupScenario({ flowType: 'INGOING', point: null });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

    await expectDraft(s);
  });

  it('when the property falls outside every region', async () => {
    const s = await setupScenario({ flowType: 'INGOING', point: POINT_OUTSIDE_SYDNEY });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);

    await expectDraft(s);
  });

  // Proves the ACTIVE filter inside resolveRegionsForAppointments is what makes
  // "region inactive" unreachable by resolution — it collapses into no match.
  it('when the only containing region is INACTIVE', async () => {
    const s = await setupScenario({ flowType: 'INGOING' });
    await seedRegion(harness.prisma, `Sydney ${rand()}`, SYDNEY_POLYGON_GEOJSON as never, 'INACTIVE');

    await expectDraft(s);
  });

  it('audits why the automation stopped', async () => {
    const s = await setupScenario({ flowType: 'INGOING', point: POINT_OUTSIDE_SYDNEY });
    auditEntries.length = 0;

    await createAppointment.execute(createInput(s));

    const incomplete = auditEntries.find((e) => e.action === 'appointment.auto_group_incomplete');
    expect(incomplete).toBeDefined();
    expect(incomplete?.metadata).toMatchObject({ reason: 'NO_REGION_MATCH', flowType: 'INGOING' });
  });
});

describe('overlapping regions', () => {
  // Both regions contain the point and both tie at COUNT = 1, so region_number
  // is the only thing keeping this from varying run to run.
  it('always files the group under the lowest region_number', async () => {
    const s = await setupScenario({ flowType: 'INGOING', point: POINT_INSIDE_OVERLAP });
    const firstRegionId = await seedRegion(harness.prisma, `Sydney A ${rand()}`, SYDNEY_POLYGON_GEOJSON as never);
    await seedRegion(harness.prisma, `Sydney B ${rand()}`, SYDNEY_EAST_POLYGON_GEOJSON as never);

    const [{ region_number: firstNumber }] = await harness.prisma.$queryRaw<Array<{ region_number: number }>>`
      SELECT region_number FROM service_regions WHERE id = ${firstRegionId}
    `;

    // Repeated so a run that happened to match by luck cannot pass.
    for (let i = 0; i < 3; i++) {
      const result = await createAppointment.execute(createInput(s));
      const group = await readGroup(result.serviceGroupId!);

      expect(group?.status).toBe('PUBLISHED');
      expect(group?.service_region_id).toBe(firstRegionId);

      const [{ region_number: chosen }] = await harness.prisma.$queryRaw<Array<{ region_number: number }>>`
        SELECT region_number FROM service_regions WHERE id = ${group!.service_region_id}
      `;
      expect(chosen).toBe(firstNumber);
    }
  });
});
