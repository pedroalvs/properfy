/**
 * Real-DB coverage for the Live Day read (F05-1, Algorithm §1) through the use case.
 * Proves the aggregated `$queryRaw` maps every column, the roster (D19), derived
 * state/progress/last-known/delay, the appointment code, and the exclusions
 * (other date / deleted / cancelled / join-with-status). The `$queryRaw` statement
 * is only exercised here, so this file is the real gate on the SQL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaLiveDayReadRepository } from '../../../src/modules/live-day/infrastructure/prisma-live-day.read-repository';
import { GetLiveDayUseCase } from '../../../src/modules/live-day/application/use-cases/get-live-day.use-case';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';

const DATE = new Date('2026-11-05T00:00:00.000Z'); // @db.Date — UTC midnight of the civil date
const NOW = new Date('2026-11-05T02:00:00.000Z'); // Sydney 13:00
const clock = { now: () => NOW };

const platformSettings = {
  get: async (key: string) =>
    key === 'fieldEvents'
      ? { geofenceRadiusMeters: 300, checkInWindowToleranceMinutes: 15, completionReminderMinutesAfterWindowEnd: 30 }
      : { delayMinutes: 20, notStartedMinutes: 30 },
} as unknown as IPlatformSettingsReader;

const amActor = {
  userId: 'u-am',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
  inspectorId: null,
  timezone: 'Australia/Sydney',
};

let harness: DbHarness;
let useCase: GetLiveDayUseCase;

const ctx = {
  tenantId: '',
  branchId: '',
  userId: '',
  stId: '',
  jane: '',
  tom: '',
  propA: '',
  propB: '',
  propC: '',
  apptA: '',
  apptB: '',
  apptC: '',
};

async function makeProperty(suffix: string, lat: string, lng: string): Promise<string> {
  const p = await harness.prisma.property.create({
    data: {
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      property_code: `P-${randomUUID().slice(0, 6)}`,
      type: 'HOUSE',
      street: `${suffix} King St`,
      suburb: 'Surry Hills',
      postcode: '2010',
      state: 'NSW',
      country: 'AU',
      lat,
      lng,
      geocoding_status: 'SUCCESS',
    },
  });
  return p.id;
}

async function makeAppointment(opts: {
  inspectorId: string;
  propertyId: string;
  date?: Date;
  status?: 'SCHEDULED' | 'DONE' | 'CANCELLED';
  deleted?: boolean;
}): Promise<string> {
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      property_id: opts.propertyId,
      service_type_id: ctx.stId,
      inspector_id: opts.inspectorId,
      status: opts.status ?? 'SCHEDULED',
      scheduled_date: opts.date ?? DATE,
      time_slot_start: '08:00',
      time_slot_end: '17:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      key_required: false,
      created_by_user_id: ctx.userId,
      deleted_at: opts.deleted ? new Date() : null,
    },
  });
  return appt.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  useCase = new GetLiveDayUseCase(new PrismaLiveDayReadRepository(harness.prisma), platformSettings, clock);

  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Ray White Surry Hills',
      legal_name: `RW-${randomUUID().slice(0, 8)}`,
      status: 'ACTIVE',
      timezone: 'Australia/Sydney',
      appointment_code_prefix: 'RWS',
    },
  });
  ctx.tenantId = tenant.id;
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenant.id, name: 'B', status: 'ACTIVE' } });
  ctx.branchId = branch.id;
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'CL_ADMIN',
      name: 'U',
      email: `u-${randomUUID().slice(0, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  ctx.userId = user.id;

  const jane = await harness.prisma.inspector.create({
    data: { name: 'Jane Doe', email: `j-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE', base_lat: '-33.8700000', base_lng: '151.2000000' },
  });
  ctx.jane = jane.id;
  const tom = await harness.prisma.inspector.create({
    data: { name: 'Tom Lee', email: `t-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE' },
  });
  ctx.tom = tom.id;

  const st = await harness.prisma.serviceType.create({
    data: {
      code: `ST-${randomUUID().slice(0, 6)}`,
      name: 'Routine',
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      default_duration_minutes: 45,
      status: 'ACTIVE',
    },
  });
  ctx.stId = st.id;

  ctx.propA = await makeProperty('12', '-33.8836000', '151.2108000');
  ctx.propB = await makeProperty('20', '-33.8900000', '151.2200000');
  ctx.propC = await makeProperty('30', '-33.8600000', '151.2000000');

  // Jane: A finished, B not started. Tom: C not started.
  ctx.apptA = await makeAppointment({ inspectorId: jane.id, propertyId: ctx.propA });
  ctx.apptB = await makeAppointment({ inspectorId: jane.id, propertyId: ctx.propB });
  ctx.apptC = await makeAppointment({ inspectorId: tom.id, propertyId: ctx.propC });

  // Exclusions for Jane: other date, deleted, cancelled.
  await makeAppointment({ inspectorId: jane.id, propertyId: ctx.propC, date: new Date('2026-11-06T00:00:00.000Z') });
  await makeAppointment({ inspectorId: jane.id, propertyId: ctx.propC, deleted: true });
  await makeAppointment({ inspectorId: jane.id, propertyId: ctx.propC, status: 'CANCELLED' });

  // Jane's execution for A: checked in + out, with finish coords.
  await harness.prisma.inspectionExecution.create({
    data: {
      appointment_id: ctx.apptA,
      inspector_id: jane.id,
      started_at: new Date('2026-11-04T22:00:00.000Z'),
      finished_at: new Date('2026-11-04T22:40:00.000Z'),
      start_latitude: '-33.8836000',
      start_longitude: '151.2108000',
      finish_latitude: '-33.8837000',
      finish_longitude: '151.2109000',
    },
  });

  // Jane's published plan (A seq1, B seq2).
  await harness.prisma.dayPlan.create({
    data: {
      inspector_id: jane.id,
      plan_date: DATE,
      timezone: 'Australia/Sydney',
      status: 'PUBLISHED',
      version: 2,
      input_fingerprint: 'fp-stale-on-purpose',
      suggested_order_json: [],
      weights_json: { travel: 1, windowWait: 1, baseProximity: 1 },
      optimizer_method: 'FIXED',
      routing_provider: 'STUB',
      last_trigger: 'SCHEDULED_PUBLISH',
      computed_at: new Date(),
      published_at: new Date(),
      origin_source: 'BASE',
      origin_lat: '-33.8700000',
      origin_lng: '151.2000000',
      departure_at: new Date('2026-11-04T20:40:00.000Z'),
      feasible: true,
      approximate: false,
      stops: {
        create: [
          { appointment_id: ctx.apptA, sequence: 1, travel_s: 1200, duration_minutes: 45, window_start_at: new Date('2026-11-04T21:00:00.000Z'), window_end_at: new Date('2026-11-05T06:00:00.000Z'), window_timezone: 'Australia/Sydney', lat: '-33.8836000', lng: '151.2108000', missing_coordinates: false, published_service_start_at: new Date('2026-11-04T21:00:00.000Z') },
          { appointment_id: ctx.apptB, sequence: 2, travel_s: 900, duration_minutes: 45, window_start_at: new Date('2026-11-04T21:30:00.000Z'), window_end_at: new Date('2026-11-05T06:00:00.000Z'), window_timezone: 'Australia/Sydney', lat: '-33.8900000', lng: '151.2200000', missing_coordinates: false, published_service_start_at: new Date('2026-11-04T21:30:00.000Z') },
        ],
      },
    },
  });
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('Live Day read (real DB, §1)', () => {
  it('rosters both inspectors sorted by name, derives state/progress', async () => {
    const { response } = await useCase.execute({ actor: amActor, query: { includeGeometry: 'none' } });
    expect(response.inspectors.map((i) => i.inspectorName)).toEqual(['Jane Doe', 'Tom Lee']);

    const jane = response.inspectors.find((i) => i.inspectorName === 'Jane Doe')!;
    expect(jane.state).toBe('IN_TRANSIT'); // A finished, B not started
    expect(jane.progress).toEqual({ done: 1, inProgress: 0, remaining: 1, total: 2 });

    const tom = response.inspectors.find((i) => i.inspectorName === 'Tom Lee')!;
    expect(tom.state).toBe('NOT_STARTED');
    expect(tom.progress.total).toBe(1);
  });

  it('maps stop fields, the appointment code and last known point', async () => {
    const { response } = await useCase.execute({ actor: amActor, query: { includeGeometry: 'none' } });
    const jane = response.inspectors.find((i) => i.inspectorName === 'Jane Doe')!;
    expect(jane.stops.map((s) => s.sequence)).toEqual([1, 2]);
    const a = jane.stops[0]!;
    expect(a.appointmentCode).toMatch(/^RWS-\d{4}$/);
    expect(a.progress).toBe('DONE');
    expect(a.lat).toBeCloseTo(-33.8836, 4);
    expect(a.startedAt).toBe('2026-11-04T22:00:00.000Z');
    expect(a.finishedAt).toBe('2026-11-04T22:40:00.000Z');
    // Last known point = Jane's check-out of A.
    expect(jane.lastKnown.source).toBe('CHECK_OUT');
    expect(jane.lastKnown.lat).toBeCloseTo(-33.8837, 4);
  });

  it('STALE via the fingerprint (stored fp does not match the recomputed inputs)', async () => {
    const { response } = await useCase.execute({ actor: amActor, query: { includeGeometry: 'none' } });
    const jane = response.inspectors.find((i) => i.inspectorName === 'Jane Doe')!;
    expect(jane.planStatus).toBe('STALE');
    expect(jane.routeOutOfDate).toBe(true);
  });

  it('excludes other-date, deleted and cancelled appointments', async () => {
    const { response } = await useCase.execute({ actor: amActor, query: { includeGeometry: 'none' } });
    const jane = response.inspectors.find((i) => i.inspectorName === 'Jane Doe')!;
    // Only A + B survive; the 3 exclusion appointments never appear.
    expect(jane.stops).toHaveLength(2);
    expect(jane.stops.map((s) => s.appointmentId).sort()).toEqual([ctx.apptA, ctx.apptB].sort());
  });

  it('geometry is an approximate straight line only when requested', async () => {
    const none = await useCase.execute({ actor: amActor, query: { includeGeometry: 'none' } });
    expect(none.response.inspectors.every((i) => i.geometry === null)).toBe(true);

    const all = await useCase.execute({ actor: amActor, query: { includeGeometry: 'all' } });
    const jane = all.response.inspectors.find((i) => i.inspectorName === 'Jane Doe')!;
    expect(jane.geometryIncluded).toBe(true);
    expect(jane.geometry).not.toBeNull();
    expect(jane.geometry!.features[0]!.properties.approximate).toBe(true);
    expect(jane.routeApproximate).toBe(true);
  });
});
