/**
 * TASK-F03-2 T039 / T040 — "Can't do this job" end-to-end against a real Postgres
 * database (acceptance criterion 00.A3).
 *
 * Proves the pieces that need a real DB + the real status-transition side effects:
 *  - cant-do on a SCHEDULED, grouped, assigned appointment drives it to REJECTED /
 *    INSPECTOR_UNABLE, NULLs service_group_id and inspector_id (unlink + release),
 *    and writes an immutable InspectorFieldEvent carrying the appointment's tenant.
 *  - the same Idempotency-Key replays the stored result without a second event.
 *  - a cant-do AFTER check-in abandons the open execution (abandoned_at set,
 *    finished_at null); a later start by another inspector restarts the SAME row.
 *
 * Real Prisma + real repos + the real transition/cant-do/start use cases; the
 * after-commit ops alert and financial/notification handlers are no-op stubs.
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
import { ReportCantDoUseCase } from '../../../src/modules/inspector-execution/application/use-cases/report-cant-do.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { DomainEventBus } from '../../../src/shared/application/events/domain-event-bus';

const noopLogger = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {},
  child() { return this; },
} as never;
const auditStub = { log: () => {} } as never;
const noopFindById = { findById: async () => null } as never;

interface Fixture {
  tenantId: string; branchId: string; userId: string; propertyId: string; serviceTypeId: string;
  inspectorId: string; inspector2Id: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const s = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({ data: { name: `CantDo ${s}`, legal_name: `CantDo LLC ${s}`, status: 'ACTIVE' } });
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: `Branch ${s}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: `Op ${s}`,
      email: `cantdo-${s}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_code: `CD-${s}`, type: 'HOUSE',
      street: '1 CantDo St', suburb: 'Testville', postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: { code: `CD-ST-${s}`, name: `CantDo Routine ${s}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });
  const inspector = await prisma.inspector.create({ data: { name: `Insp One ${s}`, email: `cd-i1-${s}@test.local`, status: 'ACTIVE' } });
  const inspector2 = await prisma.inspector.create({ data: { name: `Insp Two ${s}`, email: `cd-i2-${s}@test.local`, status: 'ACTIVE' } });
  return {
    tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id,
    serviceTypeId: serviceType.id, inspectorId: inspector.id, inspector2Id: inspector2.id,
  };
}

describe('inspector cant-do end-to-end (real DB, 00.A3 / T039 / T040)', () => {
  let harness: DbHarness | undefined;
  let fx: Fixture;
  let cantDoUseCase: ReportCantDoUseCase;
  let executionRepo: PrismaInspectionExecutionRepository;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fx = await seedFixture(harness.prisma);
    const prisma = harness.prisma;

    const appointmentRepo = new PrismaAppointmentRepository(prisma);
    executionRepo = new PrismaInspectionExecutionRepository(prisma);
    const fieldEventRepo = new PrismaInspectorFieldEventRepository(prisma);
    const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
    const idempotency = new PrismaIdempotencyService(prisma);
    const eventBus = new DomainEventBus();
    const authz = new AuthorizationService(auditStub);
    const noopHandler = { execute: async () => {} } as never;

    const transition = new ExecuteStatusTransitionUseCase(
      appointmentRepo, noopFindById, noopFindById, idempotency, auditStub, authz,
      noopHandler, noopHandler, noopFindById, eventBus, undefined, prisma, serviceGroupRepo, noopLogger,
    );
    cantDoUseCase = new ReportCantDoUseCase(
      fieldEventRepo, executionRepo, appointmentRepo, transition, idempotency, auditStub, authz,
      { notify: async () => {} } as never, eventBus, noopLogger, prisma,
    );
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function prisma(): PrismaClient {
    if (!harness) throw new Error('harness not initialized');
    return harness.prisma;
  }

  async function createGroupedScheduled(): Promise<{ appointmentId: string; groupId: string }> {
    const group = await prisma().serviceGroup.create({
      data: {
        service_type_id: fx.serviceTypeId, status: 'ACCEPTED', scheduled_date: new Date('2026-08-12'),
        time_window: '09:00-11:00', created_by_user_id: fx.userId,
      },
    });
    const appt = await prisma().appointment.create({
      data: {
        tenant_id: fx.tenantId, branch_id: fx.branchId, property_id: fx.propertyId, service_type_id: fx.serviceTypeId,
        service_group_id: group.id, inspector_id: fx.inspectorId, status: 'SCHEDULED',
        scheduled_date: new Date('2026-08-12T00:00:00.000Z'), time_slot_start: '09:00', time_slot_end: '11:00',
        price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: fx.userId,
      },
    });
    return { appointmentId: appt.id, groupId: group.id };
  }

  const inspector1Actor = (): AuthContext => ({
    userId: 'user-i1', tenantId: null, role: 'INSP', branchId: null, inspectorId: fx.inspectorId,
  });

  it('drives a grouped SCHEDULED job to REJECTED/INSPECTOR_UNABLE, unlinks and records the event (00.A3)', async () => {
    const { appointmentId, groupId } = await createGroupedScheduled();

    const res = await cantDoUseCase.execute({
      appointmentId,
      reason: 'KEY_FAILED',
      note: 'Lockbox code wrong',
      latitude: -33.86,
      longitude: 151.2,
      accuracy: 8,
      idempotencyKey: `cd-${appointmentId}`,
      actor: inspector1Actor(),
    });
    expect(res).toMatchObject({ appointmentId, appointmentStatus: 'REJECTED', executionAbandoned: false });

    const appt = await prisma().appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.status).toBe('REJECTED');
    expect(appt?.rejection_reason_code).toBe('INSPECTOR_UNABLE');
    expect(appt?.service_group_id).toBeNull();
    expect(appt?.inspector_id).toBeNull();
    expect(appt?.reason).toBe("Key didn't work — Lockbox code wrong");

    const events = await prisma().inspectorFieldEvent.findMany({ where: { appointment_id: appointmentId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'CANT_DO', reason_code: 'KEY_FAILED', tenant_id: fx.tenantId, inspector_id: fx.inspectorId });
    expect(Number(events[0]!.accuracy_m)).toBe(8);

    // The emptied group is no longer linked; the group itself still exists (cleanup is a separate subscriber).
    expect(await prisma().serviceGroup.findUnique({ where: { id: groupId } })).not.toBeNull();

    // Idempotent replay: same key → same result, no second event.
    const replay = await cantDoUseCase.execute({
      appointmentId, reason: 'KEY_FAILED', note: 'Lockbox code wrong',
      latitude: -33.86, longitude: 151.2, accuracy: 8,
      idempotencyKey: `cd-${appointmentId}`, actor: inspector1Actor(),
    });
    expect(replay.eventId).toBe(res.eventId);
    expect(await prisma().inspectorFieldEvent.count({ where: { appointment_id: appointmentId } })).toBe(1);
  }, 60_000);

  it('abandons an open check-in and restarts the same execution row on re-offer (T040)', async () => {
    const { appointmentId } = await createGroupedScheduled();

    // Check in, then report cant-do after check-in → execution abandoned.
    await prisma().inspectionExecution.create({
      data: {
        appointment_id: appointmentId, inspector_id: fx.inspectorId,
        started_at: new Date('2026-08-12T00:30:00.000Z'), start_latitude: '-33.8', start_longitude: '151.1',
      },
    });
    const res = await cantDoUseCase.execute({
      appointmentId, reason: 'SITE_ISSUE', note: 'Gate blocked', idempotencyKey: `cd2-${appointmentId}`, actor: inspector1Actor(),
    });
    expect(res.executionAbandoned).toBe(true);

    const abandoned = await prisma().inspectionExecution.findUnique({ where: { appointment_id: appointmentId } });
    expect(abandoned?.abandoned_at).not.toBeNull();
    expect(abandoned?.finished_at).toBeNull();
    const executionId = abandoned!.id;

    // Re-offer + restart: the same row is reused for the new inspector, with the
    // previous attempt cleared (this is the SQL the StartInspectionUseCase runs on
    // the abandoned-execution path; the decision to restart is unit-tested).
    await executionRepo.restart(executionId, {
      inspectorId: fx.inspector2Id,
      startedAt: new Date('2026-08-12T01:00:00.000Z'),
      startLatitude: -33.8688,
      startLongitude: 151.2093,
      geolocationDistanceMeters: 40,
      startAccuracyMeters: 10,
      startClientAt: null,
      outOfRadius: false,
      outOfWindow: false,
      geofenceRadiusMeters: 300,
    });

    const restarted = await prisma().inspectionExecution.findUnique({ where: { appointment_id: appointmentId } });
    expect(restarted?.id).toBe(executionId); // same row reused, not a second execution
    expect(restarted?.inspector_id).toBe(fx.inspector2Id);
    expect(restarted?.abandoned_at).toBeNull();
    expect(restarted?.finished_at).toBeNull();
    expect(Number(restarted?.geofence_radius_m)).toBe(300);
    expect(await prisma().inspectionExecution.count({ where: { appointment_id: appointmentId } })).toBe(1);
  }, 60_000);
});
