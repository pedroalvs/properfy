/**
 * TASK-F03-2 T024 — finish vs can't-do concurrency guards, proven against a real
 * Postgres database (SC-008).
 *
 * The invariant: finish and can't-do racing on one appointment must never leave a
 * mixed state (DONE with a CANT_DO event, or REJECTED with a finished_at). It is
 * defended in depth by (1) an appointment-row `FOR UPDATE` lock taken as the first
 * statement of each transaction, (2) an in-transaction re-read of the execution /
 * status, and (3) a status compare-and-swap (`expectedStatus: 'SCHEDULED'`).
 *
 * Tests A and B are DETERMINISTIC mutation proofs of the two mechanisms that a
 * unit test cannot exercise (real row locking, real CAS against a committed row):
 *   - A fails if `lockAppointmentForFieldEvent` is a no-op (the second txn no
 *     longer blocks).
 *   - B fails if the CAS is removed (the stale write no longer throws).
 * Test C is an end-to-end consistency sanity check over several rounds.
 *
 * MUTATION PROOF recorded in the PR: disabling the lock makes A fail; disabling
 * the CAS makes B fail. (A use-case-level race alone is NOT a reliable proof —
 * the two transactions interleave at `await` points and do not reliably overlap
 * their critical sections — which is why A/B drive the mechanisms directly with a
 * real barrier.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaInspectionExecutionRepository } from '../../../src/modules/inspector-execution/infrastructure/prisma-inspection-execution.repository';
import { PrismaInspectorFieldEventRepository } from '../../../src/modules/inspector-execution/infrastructure/prisma-inspector-field-event.repository';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { FinishInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { ReportCantDoUseCase } from '../../../src/modules/inspector-execution/application/use-cases/report-cant-do.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { DomainEventBus } from '../../../src/shared/application/events/domain-event-bus';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child() {
    return this;
  },
} as never;

const auditStub = { log: () => {} } as never;
const noopFindById = { findById: async () => null } as never;
const platformSettingsStub = {
  get: async () => ({
    geofenceRadiusMeters: 300,
    geofenceMode: 'FLAG' as const,
    checkInWindowToleranceMinutes: 15,
    completionReminderEnabled: true,
    completionReminderMinutesAfterWindowEnd: 30,
  }),
} as never;

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  serviceTypeId: string;
  inspectorId: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `Race ${suffix}`, legal_name: `Race LLC ${suffix}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `Branch ${suffix}`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `Actor ${suffix}`,
      email: `race-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `RACE-${suffix}`,
      type: 'HOUSE',
      street: '1 Race St',
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `RACE-ST-${suffix}`,
      name: `Race Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const inspector = await prisma.inspector.create({
    data: { name: `Race Inspector ${suffix}`, email: `race-insp-${suffix}@test.local`, status: 'ACTIVE' },
  });
  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
    inspectorId: inspector.id,
  };
}

describe('finish vs cant-do concurrency guards (real DB, T024 / SC-008)', () => {
  let harness: DbHarness | undefined;
  let fx: Fixture;

  let appointmentRepo: PrismaAppointmentRepository;
  let fieldEventRepo: PrismaInspectorFieldEventRepository;
  let finishUseCase: FinishInspectionUseCase;
  let cantDoUseCase: ReportCantDoUseCase;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fx = await seedFixture(harness.prisma);
    const prisma = harness.prisma;

    appointmentRepo = new PrismaAppointmentRepository(prisma);
    fieldEventRepo = new PrismaInspectorFieldEventRepository(prisma);
    const executionRepo = new PrismaInspectionExecutionRepository(prisma);
    const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
    const idempotency = new PrismaIdempotencyService(prisma);
    const eventBus = new DomainEventBus();
    const authz = new AuthorizationService(auditStub);
    const noopHandler = { execute: async () => {} } as never;

    const transition = new ExecuteStatusTransitionUseCase(
      appointmentRepo,
      noopFindById,
      noopFindById,
      idempotency,
      auditStub,
      authz,
      noopHandler,
      noopHandler,
      noopFindById,
      eventBus,
      undefined,
      prisma,
      serviceGroupRepo,
      noopLogger,
    );

    finishUseCase = new FinishInspectionUseCase(
      executionRepo,
      idempotency,
      transition,
      appointmentRepo,
      auditStub,
      authz,
      prisma,
      platformSettingsStub,
      fieldEventRepo,
    );
    cantDoUseCase = new ReportCantDoUseCase(
      fieldEventRepo,
      executionRepo,
      appointmentRepo,
      transition,
      idempotency,
      auditStub,
      authz,
      { notify: async () => {} } as never,
      eventBus,
      noopLogger,
      prisma,
    );
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function prisma(): PrismaClient {
    if (!harness) throw new Error('harness not initialized');
    return harness.prisma;
  }

  async function createScheduledAppointment(): Promise<string> {
    const appt = await prisma().appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: fx.serviceTypeId,
        inspector_id: fx.inspectorId,
        status: 'SCHEDULED',
        scheduled_date: new Date('2026-08-12T00:00:00.000Z'),
        time_slot_start: '09:00',
        time_slot_end: '11:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'CONFIRMED',
        created_by_user_id: fx.userId,
      },
    });
    return appt.id;
  }

  async function createCheckIn(appointmentId: string): Promise<void> {
    await prisma().inspectionExecution.create({
      data: {
        appointment_id: appointmentId,
        inspector_id: fx.inspectorId,
        started_at: new Date('2026-08-12T00:30:00.000Z'),
        start_latitude: '-33.8688',
        start_longitude: '151.2093',
      },
    });
  }

  // ── A: the appointment FOR UPDATE lock actually serializes ───────────────────
  // Deterministic: txn 1 takes the lock and holds it; txn 2's lock call must block
  // until txn 1 commits. A no-op lock lets txn 2 acquire immediately → this fails.
  it('serializes field-event transactions on the appointment row lock', async () => {
    const appointmentId = await createScheduledAppointment();

    let release: () => void = () => {};
    const barrier = new Promise<void>((r) => {
      release = r;
    });

    let tx2Acquired = false;

    const tx1 = prisma().$transaction(async (tx) => {
      await fieldEventRepo.lockAppointmentForFieldEvent(appointmentId, tx);
      await barrier; // hold the lock open
    }, { timeout: 15_000 });

    await sleep(250); // let txn 1 acquire the lock

    const tx2 = prisma().$transaction(async (tx) => {
      await fieldEventRepo.lockAppointmentForFieldEvent(appointmentId, tx);
      tx2Acquired = true;
    }, { timeout: 15_000 });

    await sleep(500);
    // While txn 1 holds the lock, txn 2 must still be blocked.
    expect(tx2Acquired).toBe(false);

    release();
    await Promise.all([tx1, tx2]);
    expect(tx2Acquired).toBe(true);
  }, 60_000);

  // ── B: the status compare-and-swap rejects a stale write ─────────────────────
  // Deterministic: first write (SCHEDULED→DONE, expect SCHEDULED) wins; a second
  // write expecting SCHEDULED now matches nothing and must throw. Removing the CAS
  // lets the stale write succeed → this fails.
  it('rejects a status write whose expectedStatus no longer matches (CAS)', async () => {
    const appointmentId = await createScheduledAppointment();

    await appointmentRepo.update(appointmentId, fx.tenantId, { status: 'DONE' }, undefined, 'SCHEDULED');
    const afterFirst = await prisma().appointment.findUnique({ where: { id: appointmentId } });
    expect(afterFirst?.status).toBe('DONE');

    await expect(
      appointmentRepo.update(appointmentId, fx.tenantId, { status: 'REJECTED' }, undefined, 'SCHEDULED'),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_STATUS_CHANGED' });

    // The stale write did not land.
    const afterSecond = await prisma().appointment.findUnique({ where: { id: appointmentId } });
    expect(afterSecond?.status).toBe('DONE');
  }, 60_000);

  // ── C: end-to-end finish/cant-do never produces a mixed state ────────────────
  // Sanity over several rounds: whichever wins, the appointment and execution stay
  // mutually consistent (one of DONE+finished / REJECTED+abandoned, never both).
  it('keeps appointment and execution consistent across finish/cant-do rounds', async () => {
    const inspectorActor: AuthContext = {
      userId: 'user-insp-race',
      tenantId: null,
      role: 'INSP',
      branchId: null,
      inspectorId: fx.inspectorId,
    };

    for (let round = 0; round < 8; round += 1) {
      const appointmentId = await createScheduledAppointment();
      await createCheckIn(appointmentId);

      const [finishRes, cantDoRes] = await Promise.allSettled([
        finishUseCase.execute({
          appointmentId,
          latitude: -33.8688,
          longitude: 151.2093,
          idempotencyKey: `finish-${appointmentId}`,
          actor: inspectorActor,
        }),
        cantDoUseCase.execute({
          appointmentId,
          reason: 'NO_ANSWER',
          idempotencyKey: `cantdo-${appointmentId}`,
          actor: inspectorActor,
        }),
      ]);

      expect([finishRes, cantDoRes].filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const appt = await prisma().appointment.findUnique({ where: { id: appointmentId } });
      const exec = await prisma().inspectionExecution.findUnique({ where: { appointment_id: appointmentId } });
      const cantDoEvents = await prisma().inspectorFieldEvent.count({
        where: { appointment_id: appointmentId, type: 'CANT_DO' },
      });

      if (finishRes.status === 'fulfilled') {
        expect(appt?.status).toBe('DONE');
        expect(exec?.finished_at).not.toBeNull();
        expect(exec?.abandoned_at).toBeNull();
        expect(cantDoEvents).toBe(0);
      } else {
        expect(appt?.status).toBe('REJECTED');
        expect(appt?.rejection_reason_code).toBe('INSPECTOR_UNABLE');
        expect(exec?.abandoned_at).not.toBeNull();
        expect(exec?.finished_at).toBeNull();
        expect(cantDoEvents).toBe(1);
      }
    }
  }, 120_000);
});
