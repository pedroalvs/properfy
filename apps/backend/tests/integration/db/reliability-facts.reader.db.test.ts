/**
 * Reliability facts reader + metrics engine against a real PostgreSQL database
 * (F07-1, TASK-F07-1 test 12 "Infraestrutura com banco").
 *
 * The reliability universe is attributed from three places that a mocked Prisma
 * cannot exercise: a finished `inspection_executions` row, an
 * `inspector_field_events` row, and `metadata_json->>'releasedInspectorId'` in
 * an `appointment.status_transition` audit. `appointments.inspector_id` is nulled
 * on every REJECTED/CANCELLED transition, so a DONE → REJECTED or OP no-show
 * service has no inspector on the row — only the real SQL joins resolve the right
 * inspector. A DST-exact civil-date window, the DONE-pairing by nearest audit
 * timestamp, the fixed seven-query shape (independent of inspector count) and the
 * `finished_at` index all need a real engine too.
 *
 * This test exercises the whole path end to end:
 *   PrismaReliabilityFactsReader.load / loadCompletedCounts
 *     -> buildServiceFacts
 *       -> ReliabilityMetricsService.computeAll / computeMetric
 *
 * No coordinate column is ever selected by the reader (D12). Requires Docker
 * (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  resolvePlatformSettingValue,
  type PlatformSettingKey,
  type PlatformSettingValue,
} from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaReliabilityFactsReader } from '../../../src/modules/reliability/infrastructure/prisma-reliability-facts.reader';
import { buildServiceFacts } from '../../../src/modules/reliability/domain/build-service-facts';
import { isCompletedDone, type ServiceFact } from '../../../src/modules/reliability/domain/service-fact';
import { ReliabilityMetricsService } from '../../../src/modules/reliability/application/reliability-metrics.service';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let reader: PrismaReliabilityFactsReader;
let service: ReliabilityMetricsService;
let serviceTypeId: string;

/** 30-day November 2026 window (Sydney is AEDT = UTC+11 across the whole month). */
const PERIOD = { from: '2026-11-01', to: '2026-11-30' } as const;

/** Registry-default platform settings (reliabilityIndex + fieldEvents). */
const defaultSettings: IPlatformSettingsReader = {
  get: <K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> =>
    Promise.resolve(resolvePlatformSettingValue(key, null)),
};

const suffix = (): string => Math.random().toString(36).slice(2, 10);

interface Agency {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
}

async function createAgency(name: string): Promise<Agency> {
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} Pty Ltd ${suffix()}`, status: 'ACTIVE' }, // timezone defaults to Australia/Sydney
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
      email: `rel-${suffix()}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `RL-${suffix()}`,
      type: 'HOUSE',
      street: `${Math.floor(Math.random() * 100_000)} Test St`,
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

async function createInspector(name: string, createdAt?: Date): Promise<string> {
  const inspector = await prisma.inspector.create({
    data: {
      name,
      email: `insp-${suffix()}@test.local`,
      status: 'ACTIVE',
      ...(createdAt ? { created_at: createdAt } : {}),
    },
  });
  return inspector.id;
}

async function createAppointment(
  agency: Agency,
  opts: {
    status?: 'SCHEDULED' | 'DONE' | 'REJECTED';
    scheduledDate?: string;
    inspectorId?: string | null;
    deleted?: boolean;
    rejectionReasonCode?: string | null;
    timeSlotStart?: string;
    timeSlotEnd?: string;
  } = {},
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: agency.tenantId,
      branch_id: agency.branchId,
      property_id: agency.propertyId,
      service_type_id: serviceTypeId,
      status: opts.status ?? 'DONE',
      inspector_id: opts.inspectorId === undefined ? null : opts.inspectorId,
      scheduled_date: new Date(`${opts.scheduledDate ?? '2026-11-10'}T00:00:00.000Z`),
      time_slot_start: opts.timeSlotStart ?? '09:00',
      time_slot_end: opts.timeSlotEnd ?? '11:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: agency.userId,
      rejection_reason_code: opts.rejectionReasonCode ?? null,
      deleted_at: opts.deleted ? new Date() : null,
    },
  });
  return appointment.id;
}

async function createExecution(
  appointmentId: string,
  inspectorId: string,
  opts: {
    startedAt: string;
    finishedAt?: string | null;
    abandoned?: boolean;
    resumedAt?: string | null;
    outOfWindow?: boolean;
    geofenceRadiusM?: number | null;
  },
): Promise<void> {
  await prisma.inspectionExecution.create({
    data: {
      appointment_id: appointmentId,
      inspector_id: inspectorId,
      started_at: new Date(opts.startedAt),
      finished_at: opts.finishedAt ? new Date(opts.finishedAt) : null,
      resumed_at: opts.resumedAt ? new Date(opts.resumedAt) : null,
      abandoned_at: opts.abandoned ? new Date(opts.startedAt) : null,
      out_of_window: opts.outOfWindow ?? false,
      geofence_radius_m: opts.geofenceRadiusM === undefined ? 300 : opts.geofenceRadiusM,
      start_latitude: '-33.8000000', // required column; never selected by the reader (D12)
      start_longitude: '151.2000000',
    },
  });
}

async function auditStatusTransition(opts: {
  appointmentId: string;
  tenantId: string;
  from: string;
  to: string;
  at: string;
  releasedInspectorId?: string;
  rejectionReasonCode?: string;
  /** Pass true to write metadata_json without a rejectionReasonCode key (legacy pre-F07 row). */
  omitRejectionCode?: boolean;
}): Promise<void> {
  const metadata: Record<string, string> = {};
  if (opts.releasedInspectorId) metadata.releasedInspectorId = opts.releasedInspectorId;
  if (opts.rejectionReasonCode && !opts.omitRejectionCode) metadata.rejectionReasonCode = opts.rejectionReasonCode;
  await prisma.auditLog.create({
    data: {
      tenant_id: opts.tenantId,
      actor_type: 'USER',
      entity_type: 'Appointment',
      entity_id: opts.appointmentId,
      action: 'appointment.status_transition',
      before_json: { status: opts.from },
      after_json: { status: opts.to },
      metadata_json: metadata,
      created_at: new Date(opts.at),
    },
  });
}

async function auditDoneRejected(opts: { appointmentId: string; tenantId: string; at: string }): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenant_id: opts.tenantId,
      actor_type: 'USER',
      entity_type: 'Appointment',
      entity_id: opts.appointmentId,
      action: 'appointment.done_rejected',
      created_at: new Date(opts.at),
    },
  });
}

/**
 * A DONE → REJECTED cycle attributed to `releasedInspectorId` (L-F07-04): the
 * DONE transition (for the no-execution service-date fallback), the DONE →
 * REJECTED status_transition carrying the code, and the fire-and-forget
 * `appointment.done_rejected` audit a moment later.
 */
async function seedDoneRejected(opts: {
  appointmentId: string;
  tenantId: string;
  releasedInspectorId: string;
  rejectionReasonCode?: string;
  omitRejectionCode?: boolean;
  doneAt: string;
  rejectedAt: string;
}): Promise<void> {
  await auditStatusTransition({
    appointmentId: opts.appointmentId,
    tenantId: opts.tenantId,
    from: 'SCHEDULED',
    to: 'DONE',
    at: opts.doneAt,
  });
  await auditStatusTransition({
    appointmentId: opts.appointmentId,
    tenantId: opts.tenantId,
    from: 'DONE',
    to: 'REJECTED',
    at: opts.rejectedAt,
    releasedInspectorId: opts.releasedInspectorId,
    rejectionReasonCode: opts.rejectionReasonCode ?? 'NOT_EXECUTED',
    omitRejectionCode: opts.omitRejectionCode,
  });
  // done_rejected is written after commit (fire-and-forget), a beat after the transition.
  const rejectedPlusOne = new Date(new Date(opts.rejectedAt).getTime() + 1000).toISOString();
  await auditDoneRejected({ appointmentId: opts.appointmentId, tenantId: opts.tenantId, at: rejectedPlusOne });
}

async function loadFacts(inspectorIds?: string[]): Promise<ServiceFact[]> {
  const raw = await reader.load({ ...PERIOD, inspectorIds });
  return buildServiceFacts(raw, PERIOD);
}

function factFor(facts: ServiceFact[], appointmentId: string, inspectorId: string): ServiceFact | undefined {
  return facts.find((f) => f.appointmentId === appointmentId && f.inspectorId === inspectorId);
}

describe('PrismaReliabilityFactsReader + ReliabilityMetricsService (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    reader = new PrismaReliabilityFactsReader(prisma);
    service = new ReliabilityMetricsService(reader, defaultSettings);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "inspection_executions", "inspector_field_events", "day_plan_stops", "day_plans",
         "satisfaction_surveys", "audit_logs", "appointments", "properties", "service_types",
         "users", "branches", "tenants", "inspectors" CASCADE`,
    );
    const st = await prisma.serviceType.create({
      data: {
        code: `RL-ROUTINE-${suffix()}`,
        name: `Routine Inspection ${suffix()}`,
        flow_type: 'ROUTINE',
        default_duration_minutes: 60,
      },
    });
    serviceTypeId = st.id;
  });

  it('C1: finished_at civil-date boundary — 2026-12-01 00:30 AEDT out, 2026-11-01 00:30 AEDT in', async () => {
    const agency = await createAgency('C1');
    const ana = await createInspector('Ana');

    const outAppt = await createAppointment(agency, { inspectorId: ana });
    await createExecution(outAppt, ana, { startedAt: '2026-11-30T12:00:00.000Z', finishedAt: '2026-11-30T13:30:00.000Z' });
    const inAppt = await createAppointment(agency, { inspectorId: ana });
    await createExecution(inAppt, ana, { startedAt: '2026-10-31T12:00:00.000Z', finishedAt: '2026-10-31T13:30:00.000Z' });

    const facts = await loadFacts();
    expect(factFor(facts, outAppt, ana)).toBeUndefined();
    const inFact = factFor(facts, inAppt, ana);
    expect(inFact?.kind).toBe('EXECUTED');
    expect(inFact?.serviceDate).toBe('2026-11-01');
  });

  it('C2: DONE → REJECTED after Ana executed — EXECUTED fact for Ana, doneRejected true, inspector_id null on row', async () => {
    const agency = await createAgency('C2');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null }); // reject nulled inspector_id
    await createExecution(appt, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      doneAt: '2026-11-04T03:00:00.000Z',
      rejectedAt: '2026-11-05T10:00:00.000Z',
    });

    const facts = await loadFacts();
    const fact = factFor(facts, appt, ana);
    expect(fact?.kind).toBe('EXECUTED');
    expect(fact?.origin).toBe('REJECTED_DONE');
    expect(fact?.doneRejected).toBe(true);
    expect(fact?.lateRejection).toBe(false);
    expect(fact?.serviceDate).toBe('2026-11-04');
    // A later-rejected DONE is not a completed service for the median.
    expect(isCompletedDone(fact!)).toBe(false);
    expect((await reader.loadCompletedCounts(PERIOD)).get(ana)).toBeUndefined();
  });

  it('C3: DONE without execution marked by the OP — DONE_WITHOUT_EXECUTION for appointments.inspector_id', async () => {
    const agency = await createAgency('C3');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: ana });
    // no execution row at all

    const facts = await loadFacts();
    const fact = factFor(facts, appt, ana);
    expect(fact?.kind).toBe('DONE_WITHOUT_EXECUTION');
    expect(fact?.origin).toBe('CURRENT_DONE');
    expect(fact?.serviceDate).toBe('2026-11-10');
    expect(isCompletedDone(fact!)).toBe(true);
  });

  it('C4: DONE without execution then DONE → REJECTED — DONE_WITHOUT_EXECUTION, doneRejected true, by releasedInspectorId', async () => {
    const agency = await createAgency('C4');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    // never any execution — service date must fall back to the DONE transition audit
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      doneAt: '2026-11-08T03:00:00.000Z',
      rejectedAt: '2026-11-09T10:00:00.000Z',
    });

    const facts = await loadFacts();
    const fact = factFor(facts, appt, ana);
    expect(fact?.kind).toBe('DONE_WITHOUT_EXECUTION');
    expect(fact?.origin).toBe('REJECTED_DONE');
    expect(fact?.doneRejected).toBe(true);
    expect(fact?.serviceDate).toBe('2026-11-08'); // from the DONE transition (03:00 UTC = 14:00 AEDT, still 2026-11-08)
  });

  it('C5: reoffer after DONE → REJECTED — Ana keeps the rejected EXECUTED, Gil gets the current DONE (no execution)', async () => {
    const agency = await createAgency('C5');
    const ana = await createInspector('Ana');
    const gil = await createInspector('Gil');
    // Ana executed and was done; AM rejected; appointment re-offered and Gil accepted; OP marked DONE.
    // The unique execution row still belongs to Ana (Gil's start raised ExecutionAlreadyFinishedError).
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: gil });
    await createExecution(appt, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      doneAt: '2026-11-04T03:00:00.000Z',
      rejectedAt: '2026-11-05T10:00:00.000Z',
    });

    const facts = await loadFacts();
    expect(facts.filter((f) => f.appointmentId === appt)).toHaveLength(2);

    const anaFact = factFor(facts, appt, ana);
    expect(anaFact?.kind).toBe('EXECUTED');
    expect(anaFact?.origin).toBe('REJECTED_DONE');
    expect(anaFact?.doneRejected).toBe(true);
    expect(isCompletedDone(anaFact!)).toBe(false);

    const gilFact = factFor(facts, appt, gil);
    expect(gilFact?.kind).toBe('DONE_WITHOUT_EXECUTION');
    expect(gilFact?.origin).toBe('CURRENT_DONE');
    expect(gilFact?.doneRejected).toBe(false);
    expect(isCompletedDone(gilFact!)).toBe(true);

    // Counterproof: attribution by the execution line (the old rule) would give Ana 2 facts and Gil none.
    const counts = await reader.loadCompletedCounts(PERIOD);
    expect(counts.get(gil)).toBe(1);
    expect(counts.get(ana)).toBeUndefined();
  });

  it('C6: two DONE → REJECTED cycles on one appointment — one rejected fact per inspector, paired by nearest audit', async () => {
    const agency = await createAgency('C6');
    const ana = await createInspector('Ana');
    const gil = await createInspector('Gil');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    // Ana cycle (executed) early in the month.
    await createExecution(appt, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      doneAt: '2026-11-04T03:00:00.000Z',
      rejectedAt: '2026-11-05T10:00:00.000Z',
    });
    // Gil cycle (OP done, no execution) two weeks later — far enough that nearest-audit pairing is unambiguous.
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: gil,
      doneAt: '2026-11-19T03:00:00.000Z',
      rejectedAt: '2026-11-20T10:00:00.000Z',
    });

    const facts = await loadFacts();
    expect(facts.filter((f) => f.appointmentId === appt)).toHaveLength(2);
    expect(factFor(facts, appt, ana)?.kind).toBe('EXECUTED');
    expect(factFor(facts, appt, ana)?.doneRejected).toBe(true);
    expect(factFor(facts, appt, gil)?.kind).toBe('DONE_WITHOUT_EXECUTION');
    expect(factFor(facts, appt, gil)?.doneRejected).toBe(true);
  });

  it('C7: REJECTED with a finished execution but no audits (lost fire-and-forget) — no fact', async () => {
    const agency = await createAgency('C7');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await createExecution(appt, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });
    // no appointment.done_rejected / status_transition audits at all

    const facts = await loadFacts();
    expect(facts.filter((f) => f.appointmentId === appt)).toHaveLength(0);
  });

  it('C8: CANT_ATTEND field event — attributed to Gil, service date = created_at in the agency timezone', async () => {
    const agency = await createAgency('C8');
    const gil = await createInspector('Gil');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await prisma.inspectorFieldEvent.create({
      data: {
        appointment_id: appt,
        inspector_id: gil,
        tenant_id: agency.tenantId,
        type: 'CANT_DO',
        reason_code: 'CANT_ATTEND',
        created_at: new Date('2026-11-14T22:00:00.000Z'), // 2026-11-15 09:00 AEDT
      },
    });

    const facts = await loadFacts();
    const fact = factFor(facts, appt, gil);
    expect(fact?.kind).toBe('CANT_ATTEND');
    expect(fact?.origin).toBe('CANT_ATTEND');
    expect(fact?.serviceDate).toBe('2026-11-15');
  });

  it('C9: a soft-deleted appointment never enters the universe', async () => {
    const agency = await createAgency('C9');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: ana, deleted: true });
    await createExecution(appt, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });

    const facts = await loadFacts();
    expect(facts).toHaveLength(0);
    expect((await reader.loadCompletedCounts(PERIOD)).size).toBe(0);
  });

  it('C10: plan stop published_eta flows to the fact; another inspector\'s stop for the same appointment is ignored', async () => {
    const agency = await createAgency('C10');
    const ana = await createInspector('Ana');
    const gil = await createInspector('Gil');
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: ana, scheduledDate: '2026-11-10' });
    await createExecution(appt, ana, { startedAt: '2026-11-10T00:00:00.000Z', finishedAt: '2026-11-10T02:00:00.000Z' });

    const anaEta = new Date('2026-11-10T03:30:00.000Z');
    const gilEta = new Date('2026-11-10T09:00:00.000Z');
    await seedPlanStop(agency, ana, appt, '2026-11-10', anaEta);
    await seedPlanStop(agency, gil, appt, '2026-11-10', gilEta); // a stop for a different inspector's plan

    const facts = await loadFacts();
    const fact = factFor(facts, appt, ana);
    expect(fact?.publishedEtaAt?.toISOString()).toBe(anaEta.toISOString());
    expect(fact?.publishedEtaAt?.toISOString()).not.toBe(gilEta.toISOString());
  });

  it('C11: median consistency — loadCompletedCounts matches the completed facts; CANT_ATTEND-only and later-rejected excluded', async () => {
    const agency = await createAgency('C11');
    const population: Array<{ name: string; dones: number }> = [
      { name: 'Ana', dones: 12 },
      { name: 'Ben', dones: 10 },
      { name: 'Carla', dones: 9 },
      { name: 'Dan', dones: 8 },
      { name: 'Eva', dones: 10 },
      { name: 'Fabio', dones: 9 },
    ];
    const ids: Record<string, string> = {};
    for (const p of population) {
      ids[p.name] = await createInspector(p.name);
      await seedManyDones(agency, ids[p.name]!, p.dones);
    }
    // Ana also has one DONE that was later rejected — must NOT inflate her completedCount.
    const anaRejected = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await createExecution(anaRejected, ids.Ana!, { startedAt: '2026-11-06T00:00:00.000Z', finishedAt: '2026-11-06T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: anaRejected,
      tenantId: agency.tenantId,
      releasedInspectorId: ids.Ana!,
      doneAt: '2026-11-06T03:00:00.000Z',
      rejectedAt: '2026-11-07T10:00:00.000Z',
    });
    // Gil only ever dropped a job (CANT_ATTEND) — must be absent from the completed counts.
    const gil = await createInspector('Gil');
    const gilAppt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await prisma.inspectorFieldEvent.create({
      data: {
        appointment_id: gilAppt,
        inspector_id: gil,
        tenant_id: agency.tenantId,
        type: 'CANT_DO',
        reason_code: 'CANT_ATTEND',
        created_at: new Date('2026-11-12T22:00:00.000Z'),
      },
    });

    const counts = await reader.loadCompletedCounts(PERIOD);
    expect(counts.get(ids.Ana!)).toBe(12);
    expect(counts.get(ids.Ben!)).toBe(10);
    expect(counts.get(ids.Carla!)).toBe(9);
    expect(counts.get(ids.Dan!)).toBe(8);
    expect(counts.get(ids.Eva!)).toBe(10);
    expect(counts.get(ids.Fabio!)).toBe(9);
    expect(counts.get(gil)).toBeUndefined();

    // The facts agree with the counts, service by service.
    const facts = await loadFacts();
    for (const p of population) {
      const completed = facts.filter((f) => f.inspectorId === ids[p.name] && isCompletedDone(f)).length;
      expect(completed).toBe(p.dones);
    }
  });

  it('C12: OP no-show — NO_SHOW_REJECTED for Gil even once the appointment is re-offered and completed by Hugo', async () => {
    const agency = await createAgency('C12');
    const gil = await createInspector('Gil');
    const hugo = await createInspector('Hugo');
    // Appointment ends DONE by Hugo, but earlier Gil was marked a no-show.
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: hugo, scheduledDate: '2026-11-10' });
    await createExecution(appt, hugo, { startedAt: '2026-11-10T00:00:00.000Z', finishedAt: '2026-11-10T02:00:00.000Z' });
    await auditStatusTransition({
      appointmentId: appt,
      tenantId: agency.tenantId,
      from: 'SCHEDULED',
      to: 'REJECTED',
      at: '2026-11-08T10:00:00.000Z',
      releasedInspectorId: gil,
      rejectionReasonCode: 'INSPECTOR_NO_SHOW',
    });

    const facts = await loadFacts();
    const gilFact = factFor(facts, appt, gil);
    expect(gilFact?.kind).toBe('NO_SHOW_REJECTED');
    expect(gilFact?.serviceDate).toBe('2026-11-10'); // scheduled_date
    const hugoFact = factFor(facts, appt, hugo);
    expect(hugoFact?.kind).toBe('EXECUTED');

    // Counterproof: the same rejection with OTHER yields no no-show fact.
    const appt2 = await createAppointment(agency, { status: 'REJECTED', inspectorId: null, scheduledDate: '2026-11-11' });
    await auditStatusTransition({
      appointmentId: appt2,
      tenantId: agency.tenantId,
      from: 'SCHEDULED',
      to: 'REJECTED',
      at: '2026-11-11T10:00:00.000Z',
      releasedInspectorId: gil,
      rejectionReasonCode: 'OTHER',
    });
    const facts2 = await loadFacts();
    expect(factFor(facts2, appt2, gil)).toBeUndefined();
  });

  it('C13: DONE → REJECTED code is read per paired transition — INVALID_ADDRESS / missing key give no fact, NOT_EXECUTED gives one', async () => {
    const agency = await createAgency('C13');
    const ana = await createInspector('Ana');

    const invalid = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await createExecution(invalid, ana, { startedAt: '2026-11-04T00:00:00.000Z', finishedAt: '2026-11-04T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: invalid,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      rejectionReasonCode: 'INVALID_ADDRESS',
      doneAt: '2026-11-04T03:00:00.000Z',
      rejectedAt: '2026-11-05T10:00:00.000Z',
    });

    const legacy = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await createExecution(legacy, ana, { startedAt: '2026-11-06T00:00:00.000Z', finishedAt: '2026-11-06T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: legacy,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      omitRejectionCode: true, // pre-F07 row: no rejectionReasonCode in the transition metadata
      doneAt: '2026-11-06T03:00:00.000Z',
      rejectedAt: '2026-11-07T10:00:00.000Z',
    });

    const notExecuted = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await createExecution(notExecuted, ana, { startedAt: '2026-11-08T00:00:00.000Z', finishedAt: '2026-11-08T02:00:00.000Z' });
    await seedDoneRejected({
      appointmentId: notExecuted,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      rejectionReasonCode: 'NOT_EXECUTED',
      doneAt: '2026-11-08T03:00:00.000Z',
      rejectedAt: '2026-11-09T10:00:00.000Z',
    });

    const facts = await loadFacts();
    expect(factFor(facts, invalid, ana)).toBeUndefined();
    expect(factFor(facts, legacy, ana)).toBeUndefined();
    expect(factFor(facts, notExecuted, ana)?.doneRejected).toBe(true);
  });

  it('C14: late rejection (L-F07-07) — October service, November rejection, counted once by period', async () => {
    const agency = await createAgency('C14');
    const ana = await createInspector('Ana');
    const appt = await createAppointment(agency, { status: 'REJECTED', inspectorId: null, scheduledDate: '2026-10-02' });
    await createExecution(appt, ana, { startedAt: '2026-10-02T00:00:00.000Z', finishedAt: '2026-10-02T02:00:00.000Z' }); // 2026-10-02 service
    await seedDoneRejected({
      appointmentId: appt,
      tenantId: agency.tenantId,
      releasedInspectorId: ana,
      doneAt: '2026-10-02T03:00:00.000Z',
      rejectedAt: '2026-11-05T10:00:00.000Z', // rejection 34 days later
    });

    // November window: a single lateRejection fact carried by the rejection date.
    const nov = buildServiceFacts(await reader.load(PERIOD), PERIOD).filter((f) => f.appointmentId === appt);
    expect(nov).toHaveLength(1);
    expect(nov[0]!.lateRejection).toBe(true);
    expect(nov[0]!.serviceDate).toBe('2026-11-05');

    // October window: the normal (non-late) fact on the service date.
    const octRange = { from: '2026-10-01', to: '2026-10-31' };
    const oct = buildServiceFacts(await reader.load(octRange), octRange).filter((f) => f.appointmentId === appt);
    expect(oct).toHaveLength(1);
    expect(oct[0]!.lateRejection).toBe(false);
    expect(oct[0]!.serviceDate).toBe('2026-10-02');

    // A window spanning both: still exactly one fact.
    const bothRange = { from: '2026-10-01', to: '2026-11-30' };
    const both = buildServiceFacts(await reader.load(bothRange), bothRange).filter((f) => f.appointmentId === appt);
    expect(both).toHaveLength(1);
  });

  it('C15: inspectorCreatedOn is the inspector registration civil date in Sydney', async () => {
    const agency = await createAgency('C15');
    const ana = await createInspector('Ana', new Date('2026-11-18T14:00:00.000Z')); // 2026-11-19 01:00 AEDT
    const appt = await createAppointment(agency, { status: 'DONE', inspectorId: ana });
    await createExecution(appt, ana, { startedAt: '2026-11-20T00:00:00.000Z', finishedAt: '2026-11-20T02:00:00.000Z' });

    const fact = factFor(await loadFacts(), appt, ana);
    expect(fact?.inspectorCreatedOn).toBe('2026-11-19');
  });

  it('C16: the reader runs a fixed 7 queries regardless of inspector count (Q7 included)', async () => {
    const agencyA = await createAgency('C16a');
    const solo = await createInspector('Solo');
    await seedManyDones(agencyA, solo, 1);
    expect(await countQueries(PERIOD)).toBe(7);

    // 50 inspectors × 20 services — same query count.
    const agencyB = await createAgency('C16b');
    for (let i = 0; i < 50; i++) {
      const insp = await createInspector(`Bulk-${i}`);
      await seedManyDones(agencyB, insp, 20);
    }
    expect(await countQueries(PERIOD)).toBe(7);
  });

  it('C17: the Q1 execution source is index-usable on inspection_executions_finished_at_idx', async () => {
    const agency = await createAgency('C17');
    const ana = await createInspector('Ana');
    await seedManyDones(agency, ana, 50); // enough rows for the planner to consider the index

    const { fromLower, toUpper } = instantBounds(PERIOD.from, PERIOD.to);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      // Mirrors the finished_at-ranged execution source of Q1a (the real SQL the reader generates).
      const rows = await tx.$queryRaw<Array<Record<string, string>>>(Prisma.sql`
        EXPLAIN
        SELECT e.id
        FROM inspection_executions e
        WHERE e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
          AND e.finished_at >= ${fromLower} AND e.finished_at < ${toUpper}
      `);
      const plan = rows.map((r) => Object.values(r)[0]).join('\n');
      expect(plan).toContain('inspection_executions_finished_at_idx');
    });
  });

  it('E2E: computeAll and computeMetric run over the reader end to end', async () => {
    const agency = await createAgency('E2E');
    const ana = await createInspector('Ana');
    const gil = await createInspector('Gil');
    await seedManyDones(agency, ana, 4);
    await seedManyDones(agency, gil, 2);
    // Gil also dropped one job (CANT_ATTEND) — in the universe, not a completed service.
    const gilDrop = await createAppointment(agency, { status: 'REJECTED', inspectorId: null });
    await prisma.inspectorFieldEvent.create({
      data: {
        appointment_id: gilDrop,
        inspector_id: gil,
        tenant_id: agency.tenantId,
        type: 'CANT_DO',
        reason_code: 'CANT_ATTEND',
        created_at: new Date('2026-11-12T22:00:00.000Z'),
      },
    });

    const batch = await service.computeAll(PERIOD.from, PERIOD.to);
    expect(batch.byInspector.get(ana)?.completedCount).toBe(4);
    expect(batch.byInspector.get(ana)?.volume).toBe(4);
    expect(batch.byInspector.get(gil)?.completedCount).toBe(2);
    expect(batch.byInspector.get(gil)?.volume).toBe(3); // 2 DONE + 1 CANT_ATTEND
    expect(batch.byInspector.get(ana)?.metrics).toHaveLength(8);

    const volume = await service.computeMetric('VOLUME', ana, PERIOD.from, PERIOD.to);
    expect(volume.metric).toBe('VOLUME');
    expect(volume.eligibleCount).toBe(4);
    expect(volume.volumeReference).not.toBeNull();
    expect(volume.activeDays).not.toBeNull();
  });
});

// ─── seeding helpers that need serviceTypeId / prisma from the describe scope ───

async function seedPlanStop(
  agency: Agency,
  inspectorId: string,
  appointmentId: string,
  planDate: string,
  publishedEta: Date,
): Promise<void> {
  const plan = await prisma.dayPlan.create({
    data: {
      inspector_id: inspectorId,
      plan_date: new Date(`${planDate}T00:00:00.000Z`),
      timezone: 'Australia/Sydney',
      status: 'PUBLISHED',
      input_fingerprint: suffix(),
      computed_at: new Date(`${planDate}T08:30:00.000Z`),
      last_trigger: 'SCHEDULED_PUBLISH',
      origin_source: 'BASE',
      suggested_order_json: [],
      weights_json: {},
      optimizer_method: 'exact',
      routing_provider: 'STUB',
    },
  });
  await prisma.dayPlanStop.create({
    data: {
      day_plan_id: plan.id,
      appointment_id: appointmentId,
      sequence: 1,
      window_start_at: new Date(`${planDate}T22:00:00.000Z`),
      window_end_at: new Date(`${planDate}T00:00:00.000Z`),
      window_timezone: 'Australia/Sydney',
      duration_minutes: 60,
      travel_s: 600,
      published_eta: publishedEta,
      published_service_start_at: publishedEta,
    },
  });
}

/** n current-DONE appointments with finished executions for one inspector, inside the window. */
async function seedManyDones(agency: Agency, inspectorId: string, n: number): Promise<void> {
  const apptIds = Array.from({ length: n }, () => randomUUID());
  await prisma.appointment.createMany({
    data: apptIds.map((id) => ({
      id,
      tenant_id: agency.tenantId,
      branch_id: agency.branchId,
      property_id: agency.propertyId,
      service_type_id: serviceTypeId,
      inspector_id: inspectorId,
      status: 'DONE' as const,
      scheduled_date: new Date('2026-11-10T00:00:00.000Z'),
      time_slot_start: '09:00',
      time_slot_end: '11:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED' as const,
      created_by_user_id: agency.userId,
    })),
  });
  await prisma.inspectionExecution.createMany({
    data: apptIds.map((id) => ({
      appointment_id: id,
      inspector_id: inspectorId,
      started_at: new Date('2026-11-10T00:30:00.000Z'),
      finished_at: new Date('2026-11-10T02:00:00.000Z'),
      start_latitude: '-33.8000000',
      start_longitude: '151.2000000',
    })),
  });
}

/** Instant pre-filter bounds mirroring the reader (covers any tz + DST for the civil range). */
function instantBounds(from: string, to: string): { fromLower: Date; toUpper: Date } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return {
    fromLower: new Date(Date.UTC(fy!, fm! - 1, fd! - 1, 0, 0, 0)),
    toUpper: new Date(Date.UTC(ty!, tm! - 1, td! + 2, 0, 0, 0)),
  };
}

/** Counts $queryRaw calls across one reader.load + loadCompletedCounts via a counting proxy. */
async function countQueries(range: { from: string; to: string }): Promise<number> {
  let count = 0;
  const counting = new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop === '$queryRaw') {
        return (...args: unknown[]) => {
          count += 1;
          return (target.$queryRaw as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as PrismaClient;
  const countingReader = new PrismaReliabilityFactsReader(counting);
  await countingReader.load(range);
  await countingReader.loadCompletedCounts(range);
  return count;
}
