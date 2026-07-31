/**
 * Real-DB proof that a rolled-back transaction actually undoes the appointment write.
 *
 * A mock can only show that a transaction client was passed along. Whether the
 * write lands on that transaction or escapes to the global connection is decided
 * by Prisma at runtime, and that is exactly the bug these guard: all three sites
 * below used to call `appointmentRepo.update` *inside* a `$transaction` without
 * the client, so the status change committed even when the transaction rolled
 * back. The code read as transactional and was not.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { PrismaServiceTypeRepository } from '../../../src/modules/service-type/infrastructure/prisma-service-type.repository';

let harness: DbHarness;
let repo: PrismaAppointmentRepository;
let fixture: Awaited<ReturnType<typeof seedLegacyDoneAppointment>>;
let inspectorId: string;

const auditService = { log: vi.fn() };
const AM_ACTOR = { userId: 'u1', role: 'AM', tenantId: null, branchId: null, inspectorId: null } as never;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaAppointmentRepository(harness.prisma);
  fixture = await seedLegacyDoneAppointment(harness.prisma);

  // A SCHEDULED transition requires a real inspector — the FK is enforced.
  const inspector = await harness.prisma.inspector.create({
    data: {
      name: 'Rollback Test Inspector',
      email: `rollback-${Math.random().toString(36).slice(2, 10)}@test.local`,
      status: 'ACTIVE',
    },
  });
  inspectorId = inspector.id;
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedAppointment(status: string): Promise<string> {
  const row = await harness.prisma.appointment.create({
    data: {
      tenant_id: fixture.tenantId,
      branch_id: fixture.branchId,
      property_id: fixture.propertyId,
      service_type_id: fixture.serviceTypeId,
      status: status as never,
      scheduled_date: new Date('2031-04-10'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: fixture.userId,
    },
  });
  return row.id;
}

function makeUseCase(cycleService: unknown) {
  return new ExecuteStatusTransitionUseCase(
    repo as never,
    { findById: vi.fn() } as never,
    { findById: vi.fn() } as never,
    { get: vi.fn().mockResolvedValue(null), getWithHash: vi.fn(), set: vi.fn() } as never,
    auditService as never,
    new AuthorizationService(auditService as never),
    undefined,
    undefined,
    undefined,
    undefined,
    cycleService as never,
    harness.prisma,
    undefined,
  );
}

describe('ExecuteStatusTransitionUseCase — DRAFT reopen rolls back as a unit', () => {
  it('leaves the status untouched when the confirmation cycle fails', async () => {
    const appointmentId = await seedAppointment('CANCELLED');
    const uc = makeUseCase({
      invalidateOnReopen: vi.fn().mockRejectedValue(new Error('cycle exploded')),
    });

    await expect(
      uc.execute({
        appointmentId,
        targetStatus: 'DRAFT',
        reason: 'reopening',
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow('cycle exploded');

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    // Before the fix this read 'DRAFT': the write had escaped the transaction.
    expect(row?.status).toBe('CANCELLED');
  });

  it('commits status and cycle together on the happy path', async () => {
    const appointmentId = await seedAppointment('CANCELLED');
    const invalidateOnReopen = vi.fn().mockResolvedValue(undefined);
    const uc = makeUseCase({ invalidateOnReopen });

    await uc.execute({
      appointmentId,
      targetStatus: 'DRAFT',
      reason: 'reopening',
      actor: AM_ACTOR,
    });

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.status).toBe('DRAFT');
    expect(invalidateOnReopen).toHaveBeenCalled();
  });
});

describe('executeInTransaction — composed into a caller transaction', () => {
  it('rolls the appointment write back with the caller, and drops the idempotency key with it', async () => {
    // The key is the subtle one: written outside the transaction it survives the
    // rollback, and the retry then reads a cached success for a transition that
    // never happened.
    const appointmentId = await seedAppointment('AWAITING_INSPECTOR');
    const key = `rollback-test-${Math.random().toString(36).slice(2, 10)}`;
    const idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      getWithHash: vi.fn(),
      set: vi.fn(async (k: string, scope: string, response: unknown, ttl: number, hash: unknown, tx: never) => {
        await (tx ?? harness.prisma).idempotencyKey.upsert({
          where: { key: k },
          update: {},
          create: {
            key: k,
            scope,
            response: response as never,
            payload_hash: null,
            expires_at: new Date(Date.now() + ttl * 3600 * 1000),
          },
        });
      }),
    };

    const uc = new ExecuteStatusTransitionUseCase(
      repo as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as never,
      idempotencyService as never,
      auditService as never,
      new AuthorizationService(auditService as never),
      undefined, undefined, undefined, undefined, undefined,
      harness.prisma,
      undefined,
    );

    await expect(
      harness.prisma.$transaction(async (tx) => {
        await uc.executeInTransaction(
          { appointmentId, targetStatus: 'SCHEDULED', idempotencyKey: key, inspectorId, actor: AM_ACTOR },
          tx,
        );
        throw new Error('caller changed its mind');
      }),
    ).rejects.toThrow('caller changed its mind');

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.status).toBe('AWAITING_INSPECTOR');

    const cached = await harness.prisma.idempotencyKey.findUnique({ where: { key } });
    expect(cached).toBeNull();
  });

  it('commits the write when the caller transaction commits', async () => {
    const appointmentId = await seedAppointment('AWAITING_INSPECTOR');

    const result = await harness.prisma.$transaction((tx) =>
      makeUseCase(undefined).executeInTransaction(
        { appointmentId, targetStatus: 'SCHEDULED', inspectorId, actor: AM_ACTOR },
        tx,
      ),
    );
    await result.runAfterCommit();

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.status).toBe('SCHEDULED');
  });

  it('sees the caller transaction\'s uncommitted inspector write', async () => {
    // The crux of the portal join. Guard 6 rejects a SCHEDULED transition unless
    // the appointment already has an inspector or the input supplies one. Here
    // the ONLY inspector is the one the caller wrote uncommitted, and no
    // inspectorId is passed — so this passes if and only if `findById` read
    // through `tx`. On the global client it reads NULL and throws
    // AppointmentInspectorRequiredError.
    const appointmentId = await seedAppointment('AWAITING_INSPECTOR');

    const result = await harness.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { inspector_id: inspectorId },
      });
      return makeUseCase(undefined).executeInTransaction(
        { appointmentId, targetStatus: 'SCHEDULED', actor: AM_ACTOR },
        tx,
      );
    });
    await result.runAfterCommit();

    expect(result.output.status).toBe('SCHEDULED');
  });

  it('sees the caller transaction\'s uncommitted confirmation status (guard 6b)', async () => {
    // The join's second hop in miniature: a ROUTINE service type requiring rental
    // tenant confirmation refuses AWAITING_INSPECTOR -> SCHEDULED unless the
    // appointment reads CONFIRMED. The portal join gets that value from
    // reservePortalWindow's uncommitted write, so this pins `findById` reading
    // through the transaction on the exact guard the join depends on.
    //
    // It does NOT pin serviceTypeRepo's own tx threading: the service type is
    // committed before the transaction opens, so a repo ignoring `tx` still reads
    // it. That parameter is there for connection hygiene (not borrowing a second
    // pooled connection while one is pinned), which needs no correctness proof.
    const routine = await harness.prisma.serviceType.create({
      data: {
        code: `TX-ROUTINE-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Tx Routine Inspection',
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    const row = await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: routine.id,
        status: 'AWAITING_INSPECTOR',
        scheduled_date: new Date('2031-04-10'),
        time_slot_start: '09:00',
        time_slot_end: '12:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        // Deliberately NOT confirmed on disk.
        rental_tenant_confirmation_status: 'PENDING',
        inspector_id: inspectorId,
        created_by_user_id: fixture.userId,
      },
    });

    const uc = new ExecuteStatusTransitionUseCase(
      repo as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as never,
      { get: vi.fn().mockResolvedValue(null), getWithHash: vi.fn(), set: vi.fn() } as never,
      auditService as never,
      new AuthorizationService(auditService as never),
      undefined,
      undefined,
      new PrismaServiceTypeRepository(harness.prisma) as never,
      undefined,
      undefined,
      harness.prisma,
      undefined,
    );

    const result = await harness.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: row.id },
        data: { rental_tenant_confirmation_status: 'CONFIRMED' },
      });
      return uc.executeInTransaction(
        { appointmentId: row.id, targetStatus: 'SCHEDULED', actor: AM_ACTOR },
        tx,
      );
    });
    await result.runAfterCommit();

    expect(result.output.status).toBe('SCHEDULED');
  });
});
