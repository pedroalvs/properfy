/**
 * F08 region/service-type scope on the F07 facts reader, against real PostGIS
 * (F08-1 test 16). Self-contained (its own light seeding, no F07 worked-example
 * population) so the scope SQL — `ST_Intersects(sr.geom, p.coordinates)` and
 * `a.service_type_id = $` — is verified directly, and `completedServiceDates`
 * round-trips. The unscoped regression + query count live in
 * `reliability-facts.reader.db.test.ts`.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePlatformSettingValue, type PlatformSettingKey, type PlatformSettingValue } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaReliabilityFactsReader } from '../../../src/modules/reliability/infrastructure/prisma-reliability-facts.reader';
import { ReliabilityMetricsService } from '../../../src/modules/reliability/application/reliability-metrics.service';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';

const PERIOD = { from: '2026-11-01', to: '2026-11-30' } as const;
const suffix = (): string => Math.random().toString(36).slice(2, 10);

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let service: ReliabilityMetricsService;
let serviceTypeId: string;

const defaultsReader: IPlatformSettingsReader = {
  get: async <K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> =>
    resolvePlatformSettingValue(key, null).value,
};

interface Agency {
  tenantId: string;
  branchId: string;
  userId: string;
}

async function createAgency(): Promise<Agency> {
  const tenant = await prisma.tenant.create({ data: { name: `S${suffix()}`, legal_name: `S ${suffix()}`, status: 'ACTIVE' } });
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: 'Branch', status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'Op',
      email: `scope-${suffix()}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
}

async function createInspector(): Promise<string> {
  const insp = await prisma.inspector.create({ data: { name: 'Insp', email: `si-${suffix()}@test.local`, status: 'ACTIVE' } });
  return insp.id;
}

async function createPropertyAt(agency: Agency, lng: number, lat: number): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenant_id: agency.tenantId, branch_id: agency.branchId, property_code: `RL-${suffix()}`,
      type: 'HOUSE', street: `${Math.floor(Math.random() * 100_000)} St`, suburb: 'Scopeville',
      postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE properties SET coordinates = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) WHERE id = $1`,
    property.id,
  );
  return property.id;
}

async function createDoneWithExecution(agency: Agency, inspectorId: string, propertyId: string, stId: string): Promise<void> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: agency.tenantId, branch_id: agency.branchId, property_id: propertyId, service_type_id: stId,
      status: 'DONE', inspector_id: inspectorId, scheduled_date: new Date('2026-11-10T00:00:00.000Z'),
      time_slot_start: '09:00', time_slot_end: '11:00', price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: agency.userId,
    },
  });
  await prisma.inspectionExecution.create({
    data: {
      appointment_id: appointment.id, inspector_id: inspectorId,
      started_at: new Date('2026-11-10T00:00:00.000Z'), finished_at: new Date('2026-11-10T02:00:00.000Z'),
      out_of_window: false, geofence_radius_m: 300, start_latitude: '-33.8000000', start_longitude: '151.2000000',
    },
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  prisma = harness.prisma;
  service = new ReliabilityMetricsService(new PrismaReliabilityFactsReader(prisma), defaultsReader);
  const st = await prisma.serviceType.create({
    data: { code: `ST${suffix()}`, name: 'Routine', flow_type: 'ROUTINE', default_duration_minutes: 45 },
  });
  serviceTypeId = st.id;
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('F08 scope on the facts reader (test 16)', () => {
  it('REGION_VOLUME scope counts only completions inside the region polygon', async () => {
    const agency = await createAgency();
    const insp = await createInspector();
    const inside = await createPropertyAt(agency, 151.2, -33.8);
    const outside = await createPropertyAt(agency, 150.0, -34.5);
    const region = await prisma.serviceRegion.create({ data: { tenant_id: agency.tenantId, name: `Box ${suffix()}` } });
    await prisma.$executeRawUnsafe(
      `UPDATE service_regions SET geom = ST_SetSRID(ST_GeomFromText('POLYGON((151.0 -34.0,151.4 -34.0,151.4 -33.6,151.0 -33.6,151.0 -34.0))'), 4326) WHERE id = $1`,
      region.id,
    );
    await createDoneWithExecution(agency, insp, inside, serviceTypeId);
    await createDoneWithExecution(agency, insp, outside, serviceTypeId);

    const scoped = await service.computeAll(PERIOD.from, PERIOD.to, [insp], { regionId: region.id });
    expect(scoped.byInspector.get(insp)?.completedCount).toBe(1);

    const unscoped = await service.computeAll(PERIOD.from, PERIOD.to, [insp]);
    expect(unscoped.byInspector.get(insp)?.completedCount).toBe(2);
  });

  it('a region with NULL geom matches no service', async () => {
    const agency = await createAgency();
    const insp = await createInspector();
    const prop = await createPropertyAt(agency, 151.2, -33.8);
    const region = await prisma.serviceRegion.create({ data: { tenant_id: agency.tenantId, name: `NoGeom ${suffix()}` } });
    await createDoneWithExecution(agency, insp, prop, serviceTypeId);

    const scoped = await service.computeAll(PERIOD.from, PERIOD.to, [insp], { regionId: region.id });
    expect(scoped.byInspector.get(insp)?.completedCount ?? 0).toBe(0);
  });

  it('SERVICE_TYPE_VOLUME scope counts only completions of the service type', async () => {
    const agency = await createAgency();
    const insp = await createInspector();
    const prop = await createPropertyAt(agency, 151.2, -33.8);
    const other = await prisma.serviceType.create({
      data: { code: `ST${suffix()}`, name: 'Ingoing', flow_type: 'INGOING', default_duration_minutes: 45 },
    });
    await createDoneWithExecution(agency, insp, prop, serviceTypeId);
    await createDoneWithExecution(agency, insp, prop, other.id);

    const scoped = await service.computeAll(PERIOD.from, PERIOD.to, [insp], { serviceTypeId: other.id });
    expect(scoped.byInspector.get(insp)?.completedCount).toBe(1);
  });

  it('completedServiceDates length equals completedCount and is ascending', async () => {
    const agency = await createAgency();
    const insp = await createInspector();
    const prop = await createPropertyAt(agency, 151.2, -33.8);
    await createDoneWithExecution(agency, insp, prop, serviceTypeId);
    await createDoneWithExecution(agency, insp, prop, serviceTypeId);

    const batch = await service.computeAll(PERIOD.from, PERIOD.to, [insp]);
    const comp = batch.byInspector.get(insp);
    expect(comp?.completedServiceDates).toHaveLength(comp?.completedCount ?? -1);
    expect(comp?.completedServiceDates).toEqual([...(comp?.completedServiceDates ?? [])].sort());
  });
});
