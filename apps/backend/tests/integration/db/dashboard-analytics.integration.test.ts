/**
 * Analytics aggregations against a real PostgreSQL database.
 *
 * Why a real database and not a mocked Prisma client: a mock returns whatever
 * it was told to regardless of the `where` it was handed, so it cannot tell
 * "the tenant predicate isolates rows" from "the tenant predicate was silently
 * dropped". Nor can it observe a date-range off-by-one — the two failures this
 * file exists to catch.
 *
 * The timezone cases are the subtle half. `scheduled_date` is a `@db.Date`
 * pinned to UTC midnight of a Sydney civil date and must range as a plain civil
 * range, while `financial_entries.effective_at` is a real instant and must
 * range on Sydney day boundaries. An implementation that treats both the same
 * way passes every unit test and still puts a Friday-evening payment in the
 * wrong week.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaDashboardAnalyticsRepository } from '../../../src/modules/dashboard/infrastructure/prisma-dashboard-analytics.repository';
import type { AnalyticsQuery } from '../../../src/modules/dashboard/domain/dashboard-analytics.repository';

const PERIOD = { startDate: '2026-07-01', endDate: '2026-07-31' };

interface Agency {
  tenantId: string;
  branchId: string;
  userId: string;
}

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let repo: PrismaDashboardAnalyticsRepository;

/** Service types are global (no tenant_id), so both agencies share these. */
let routineTypeId: string;
let ingoingTypeId: string;

const suffix = () => Math.random().toString(36).slice(2, 10);

async function createAgency(name: string): Promise<Agency> {
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} Pty Ltd ${suffix()}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `${name} Actor`,
      email: `analytics-${suffix()}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
}

async function createProperty(
  agency: Agency,
  opts: { suburb: string; lat?: number | null; lng?: number | null },
): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenant_id: agency.tenantId,
      branch_id: agency.branchId,
      property_code: `AN-${suffix()}`,
      type: 'HOUSE',
      // `properties` is unique on (tenant_id, normalized_address_key), so two
      // fixtures in one agency must not share a street — even when the point of
      // the test is that they share a suburb.
      street: `${Math.floor(Math.random() * 100_000)} Test St`,
      suburb: opts.suburb,
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      lat: opts.lat === undefined ? -33.9 : opts.lat,
      lng: opts.lng === undefined ? 151.18 : opts.lng,
      geocoding_status: opts.lat === null ? 'PENDING' : 'SUCCESS',
    },
  });
  return property.id;
}

async function createAppointment(
  agency: Agency,
  opts: {
    propertyId: string;
    scheduledDate: string;
    status?: 'DRAFT' | 'AWAITING_INSPECTOR' | 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'REJECTED';
    serviceTypeId?: string;
    confirmation?: 'PENDING' | 'CONFIRMED' | 'NO_RESPONSE';
    deleted?: boolean;
  },
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: agency.tenantId,
      branch_id: agency.branchId,
      property_id: opts.propertyId,
      service_type_id: opts.serviceTypeId ?? routineTypeId,
      status: opts.status ?? 'DONE',
      // A @db.Date column: UTC midnight of the Sydney civil date.
      scheduled_date: new Date(`${opts.scheduledDate}T00:00:00.000Z`),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: opts.confirmation ?? 'PENDING',
      created_by_user_id: agency.userId,
      deleted_at: opts.deleted ? new Date() : null,
    },
  });
  return appointment.id;
}

async function createRevenueEntry(agency: Agency, effectiveAt: Date, amount: string): Promise<void> {
  await prisma.financialEntry.create({
    data: {
      tenant_id: agency.tenantId,
      entry_type: 'TENANT_DEBIT',
      amount,
      currency: 'AUD',
      status: 'APPROVED',
      description: 'Analytics test debit',
      effective_at: effectiveAt,
      initiated_by_user_id: agency.userId,
    },
  });
}

function query(overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return {
    ...PERIOD,
    granularity: 'day',
    includeRevenue: true,
    now: new Date('2026-07-15T02:00:00.000Z'),
    ...overrides,
  };
}

describe('Analytics aggregations (real DB)', () => {
  let agencyA: Agency;
  let agencyB: Agency;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaDashboardAnalyticsRepository(prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "financial_entries", "inspection_executions", "appointments", "properties", "service_types", "users", "branches", "tenants" CASCADE`,
    );
    const routineSuffix = suffix();
    const routine = await prisma.serviceType.create({
      data: {
        code: `AN-ROUTINE-${routineSuffix}`,
        name: `Routine Inspection ${routineSuffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    const ingoingSuffix = suffix();
    const ingoing = await prisma.serviceType.create({
      data: {
        code: `AN-INGOING-${ingoingSuffix}`,
        name: `Ingoing Inspection ${ingoingSuffix}`,
        flow_type: 'INGOING',
        requires_rental_tenant_confirmation: false,
        status: 'ACTIVE',
      },
    });
    routineTypeId = routine.id;
    ingoingTypeId = ingoing.id;

    agencyA = await createAgency('Analytics Agency A');
    agencyB = await createAgency('Analytics Agency B');
  });

  describe('tenant isolation', () => {
    it('an agency-scoped run counts only its own appointments', async () => {
      const propertyA = await createProperty(agencyA, { suburb: 'Newtown' });
      const propertyB = await createProperty(agencyB, { suburb: 'Newtown' });
      await createAppointment(agencyA, { propertyId: propertyA, scheduledDate: '2026-07-10' });
      await createAppointment(agencyA, { propertyId: propertyA, scheduledDate: '2026-07-11' });
      await createAppointment(agencyB, { propertyId: propertyB, scheduledDate: '2026-07-12' });

      const scoped = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(scoped.kpis.inPeriod).toBe(2);

      const unscoped = await repo.getAnalytics(query());
      expect(unscoped.kpis.inPeriod).toBe(3);
    });

    it('an agency-scoped run never sums another agency revenue', async () => {
      await createRevenueEntry(agencyA, new Date('2026-07-10T02:00:00.000Z'), '100.00');
      await createRevenueEntry(agencyB, new Date('2026-07-10T02:00:00.000Z'), '900.00');

      const scoped = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(scoped.revenue?.amount).toBe(100);

      const unscoped = await repo.getAnalytics(query());
      expect(unscoped.revenue?.amount).toBe(1000);
    });

    it('isolates the heatmap by agency', async () => {
      const propertyA = await createProperty(agencyA, { suburb: 'Newtown' });
      const propertyB = await createProperty(agencyB, { suburb: 'Bondi' });
      await createAppointment(agencyA, { propertyId: propertyA, scheduledDate: '2026-07-10' });
      await createAppointment(agencyB, { propertyId: propertyB, scheduledDate: '2026-07-10' });

      const scoped = await repo.getHeatmap({ ...PERIOD, tenantId: agencyA.tenantId });
      expect(scoped.points.map((p) => p.suburb)).toEqual(['Newtown']);
    });
  });

  describe('period boundaries', () => {
    it('includes both endpoints of the civil-date range and excludes the day after', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-06-30' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-01' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-31' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-08-01' });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.kpis.inPeriod).toBe(2);
    });

    it('excludes soft-deleted appointments', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-10' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-11', deleted: true });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.kpis.inPeriod).toBe(1);
    });

    it('keeps a late-evening Sydney payment inside the period it belongs to', async () => {
      // 2026-07-31 23:30 Sydney is 2026-07-31T13:30Z — inside the period on a
      // Sydney boundary, and also inside on a naive UTC one, so pair it with
      // the case below that only a Sydney boundary gets right.
      await createRevenueEntry(agencyA, new Date('2026-07-31T13:30:00.000Z'), '50.00');
      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.revenue?.amount).toBe(50);
    });

    it('keeps a payment made just after Sydney midnight out of the period', async () => {
      // 2026-08-01 00:30 Sydney is 2026-07-31T14:30Z. On a UTC day boundary
      // that instant still reads as 31 July and would be wrongly included.
      await createRevenueEntry(agencyA, new Date('2026-07-31T14:30:00.000Z'), '50.00');
      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.revenue?.amount).toBe(0);
    });

    it('pulls in a payment made just after Sydney midnight on the first day', async () => {
      // 2026-07-01 00:30 Sydney is 2026-06-30T14:30Z — before UTC midnight of
      // 1 July, so a naive UTC lower bound would drop it.
      await createRevenueEntry(agencyA, new Date('2026-06-30T14:30:00.000Z'), '50.00');
      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.revenue?.amount).toBe(50);
    });
  });

  describe('confirmation rate', () => {
    it('counts only service types that ask the rental tenant', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      // Routine requires confirmation: 2 eligible, 1 confirmed.
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-10', confirmation: 'CONFIRMED' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-11', confirmation: 'NO_RESPONSE' });
      // Ingoing does not: must not enter the denominator even when confirmed.
      await createAppointment(agencyA, {
        propertyId: property,
        scheduledDate: '2026-07-12',
        serviceTypeId: ingoingTypeId,
        confirmation: 'CONFIRMED',
      });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.confirmationRate).toEqual({ confirmed: 1, eligible: 2 });
    });

    it('reports a zero denominator rather than inventing a rate', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      await createAppointment(agencyA, {
        propertyId: property,
        scheduledDate: '2026-07-10',
        serviceTypeId: ingoingTypeId,
      });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.confirmationRate).toEqual({ confirmed: 0, eligible: 0 });
    });
  });

  describe('service-type aggregations', () => {
    it('distributes appointments across service types with resolved names', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-10' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-11' });
      await createAppointment(agencyA, {
        propertyId: property,
        scheduledDate: '2026-07-12',
        serviceTypeId: ingoingTypeId,
      });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.serviceTypeDistribution).toHaveLength(2);
      expect(result.serviceTypeDistribution[0]).toMatchObject({ serviceTypeId: routineTypeId, count: 2 });
      expect(result.serviceTypeDistribution[0].name).toContain('Routine Inspection');
    });

    it('averages real execution durations per service type', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      const inspector = await prisma.inspector.create({
        data: {
          name: 'Analytics Inspector',
          email: `insp-${suffix()}@test.local`,
          phone: '+61400000000',
          status: 'ACTIVE',
        },
      });
      const first = await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-10' });
      const second = await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-11' });

      await prisma.inspectionExecution.createMany({
        data: [
          {
            appointment_id: first,
            inspector_id: inspector.id,
            started_at: new Date('2026-07-10T23:00:00.000Z'),
            finished_at: new Date('2026-07-10T23:40:00.000Z'),
            start_latitude: '-33.9',
            start_longitude: '151.18',
          },
          {
            appointment_id: second,
            inspector_id: inspector.id,
            started_at: new Date('2026-07-11T23:00:00.000Z'),
            finished_at: new Date('2026-07-11T23:50:00.000Z'),
            start_latitude: '-33.9',
            start_longitude: '151.18',
          },
        ],
      });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.avgExecutionMinutes).toEqual([
        expect.objectContaining({ serviceTypeId: routineTypeId, avgMinutes: 45, sampleSize: 2 }),
      ]);
    });

    it('ignores an execution that has not finished', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      const inspector = await prisma.inspector.create({
        data: {
          name: 'Analytics Inspector',
          email: `insp-${suffix()}@test.local`,
          phone: '+61400000000',
          status: 'ACTIVE',
        },
      });
      const appointment = await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-10' });
      await prisma.inspectionExecution.create({
        data: {
          appointment_id: appointment,
          inspector_id: inspector.id,
          started_at: new Date('2026-07-10T23:00:00.000Z'),
          finished_at: null,
          start_latitude: '-33.9',
          start_longitude: '151.18',
        },
      });

      const result = await repo.getAnalytics(query({ tenantId: agencyA.tenantId }));
      expect(result.avgExecutionMinutes).toEqual([]);
    });
  });

  describe('evolution series', () => {
    it('buckets by the stored civil date without a timezone shift', async () => {
      const property = await createProperty(agencyA, { suburb: 'Newtown' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-02' });
      await createAppointment(agencyA, { propertyId: property, scheduledDate: '2026-07-02' });

      const result = await repo.getAnalytics(
        query({ tenantId: agencyA.tenantId, startDate: '2026-07-01', endDate: '2026-07-03' }),
      );
      expect(result.evolution).toEqual([
        { bucketStart: '2026-07-01', count: 0 },
        { bucketStart: '2026-07-02', count: 2 },
        { bucketStart: '2026-07-03', count: 0 },
      ]);
    });
  });

  describe('heatmap', () => {
    it('aggregates by suburb and reports ungeocoded appointments separately', async () => {
      const geocoded = await createProperty(agencyA, { suburb: 'Newtown', lat: -33.9, lng: 151.18 });
      const alsoNewtown = await createProperty(agencyA, { suburb: 'newtown', lat: -33.9, lng: 151.18 });
      const ungeocoded = await createProperty(agencyA, { suburb: 'Bondi', lat: null, lng: null });

      await createAppointment(agencyA, { propertyId: geocoded, scheduledDate: '2026-07-10' });
      await createAppointment(agencyA, { propertyId: alsoNewtown, scheduledDate: '2026-07-11' });
      await createAppointment(agencyA, { propertyId: ungeocoded, scheduledDate: '2026-07-12' });

      const result = await repo.getHeatmap({ ...PERIOD, tenantId: agencyA.tenantId });
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toMatchObject({ count: 2 });
      expect(result.totalPlotted).toBe(2);
      expect(result.totalWithoutCoordinates).toBe(1);
    });
  });
});
