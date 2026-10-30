import { describe, expect, it, vi } from 'vitest';
import { ReportCantDoUseCase } from './report-cant-do.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { DomainEventBus, INSPECTOR_FIELD_EVENTS } from '../../../../shared/application/events/domain-event-bus';

const INSP = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

const TX = { __tx: true };

function buildPrismaStub() {
  return { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)) };
}

interface Overrides {
  appointment?: Record<string, unknown>;
  inspectorName?: string | null;
  execution?: unknown;
  latestCantDo?: unknown;
  idempotency?: Record<string, unknown>;
  transition?: Record<string, unknown>;
  notify?: { notify: ReturnType<typeof vi.fn> };
  eventBus?: DomainEventBus;
}

function build(overrides: Overrides = {}) {
  const runAfterCommit = vi.fn().mockResolvedValue(undefined);
  const fieldEventRepo = {
    lockAppointmentForFieldEvent: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    findLatestCantDoByAppointmentId: vi.fn().mockResolvedValue(overrides.latestCantDo ?? null),
    findLatestCantDoByAppointmentIds: vi.fn(),
    listByAppointmentId: vi.fn(),
  };
  const executionRepo = {
    findByAppointmentId: vi.fn().mockResolvedValue(overrides.execution ?? null),
    markAbandoned: vi.fn().mockResolvedValue(undefined),
  };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
        inspectorId: 'insp-1',
        serviceGroupId: 'sg-1',
        ...overrides.appointment,
      },
      inspectorName: overrides.inspectorName ?? 'Jane Doe',
    }),
  };
  const transition = overrides.transition ?? {
    executeInTransaction: vi.fn().mockResolvedValue({
      output: { status: 'REJECTED' },
      runAfterCommit,
    }),
  };
  const idempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ...overrides.idempotency,
  };
  const auditService = { log: vi.fn() };
  const notify = overrides.notify ?? { notify: vi.fn().mockResolvedValue(undefined) };
  const eventBus = overrides.eventBus ?? new DomainEventBus();
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

  const useCase = new ReportCantDoUseCase(
    fieldEventRepo as never,
    executionRepo as never,
    appointmentRepo as never,
    transition as never,
    idempotencyService as never,
    auditService as never,
    new AuthorizationService(auditService as never),
    notify as never,
    eventBus,
    logger,
    buildPrismaStub() as never,
  );
  return { useCase, fieldEventRepo, executionRepo, appointmentRepo, transition, idempotencyService, auditService, notify, eventBus, runAfterCommit };
}

const baseInput = {
  appointmentId: 'apt-1',
  reason: 'NO_ANSWER' as const,
  idempotencyKey: 'k1',
  actor: INSP,
};

describe('ReportCantDoUseCase', () => {
  it('records the event and rejects via SYS with INSPECTOR_UNABLE (no check-in)', async () => {
    const ctx = build();
    const result = await ctx.useCase.execute(baseInput);

    expect(result).toMatchObject({
      appointmentId: 'apt-1',
      appointmentStatus: 'REJECTED',
      executionAbandoned: false,
    });
    expect(ctx.fieldEventRepo.lockAppointmentForFieldEvent).toHaveBeenCalledWith('apt-1', TX);
    expect(ctx.fieldEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CANT_DO', tenantId: 'tenant-1', reasonCode: 'NO_ANSWER' }),
      TX,
    );
    expect((ctx.transition as { executeInTransaction: ReturnType<typeof vi.fn> }).executeInTransaction)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          targetStatus: 'REJECTED',
          rejectionReasonCode: 'INSPECTOR_UNABLE',
          expectedStatus: 'SCHEDULED',
          actor: expect.objectContaining({ role: 'SYS', tenantId: 'tenant-1' }),
          auditMetadata: expect.objectContaining({ source: 'INSPECTOR_CANT_DO', initiatedByInspectorId: 'insp-1' }),
        }),
        TX,
      );
    expect(ctx.idempotencyService.set).toHaveBeenCalledWith('k1', 'cant-do', result, 24, expect.any(String), TX);
  });

  it('builds the appointment reason from the label plus the note', async () => {
    const ctx = build();
    await ctx.useCase.execute({ ...baseInput, reason: 'KEY_FAILED', note: 'Lockbox code wrong' });
    const call = (ctx.transition as { executeInTransaction: ReturnType<typeof vi.fn> }).executeInTransaction.mock.calls[0]![0];
    expect(call.reason).toBe("Key didn't work — Lockbox code wrong");
  });

  it('abandons an in-progress execution after check-in', async () => {
    const ctx = build({
      execution: { id: 'exec-1', isFinished: () => false, isInProgress: () => true, isAbandoned: () => false },
    });
    const result = await ctx.useCase.execute(baseInput);
    expect(result.executionAbandoned).toBe(true);
    expect(ctx.executionRepo.markAbandoned).toHaveBeenCalledWith('exec-1', expect.any(Date), TX);
    expect(ctx.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspection_execution.abandoned', entityId: 'exec-1' }),
    );
  });

  it('refuses when the execution is already finished (409)', async () => {
    const ctx = build({
      execution: { id: 'exec-1', isFinished: () => true, isInProgress: () => false, isAbandoned: () => false },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'EXECUTION_ALREADY_FINISHED' });
    expect(ctx.idempotencyService.set).not.toHaveBeenCalled();
  });

  it('returns 404 for a job assigned to another inspector', async () => {
    const ctx = build({ appointment: { inspectorId: 'insp-2' } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('returns CANT_DO_ALREADY_REPORTED when the inspector already reported it', async () => {
    const ctx = build({
      appointment: { inspectorId: null, status: 'REJECTED' },
      latestCantDo: { inspectorId: 'insp-1' },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'CANT_DO_ALREADY_REPORTED' });
  });

  it('returns FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED when assigned but not SCHEDULED', async () => {
    const ctx = build({ appointment: { status: 'DONE' } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED' });
  });

  it('rejects a non-INSP actor (403)', async () => {
    const ctx = build();
    await expect(
      ctx.useCase.execute({ ...baseInput, actor: { ...INSP, role: 'OP' as const } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an INSP without a linked inspector profile (403)', async () => {
    const ctx = build();
    await expect(
      ctx.useCase.execute({ ...baseInput, actor: { ...INSP, inspectorId: null } }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_NOT_LINKED' });
  });

  it('returns the cached response for a repeated key, without a second write', async () => {
    const cachedResponse = { eventId: 'e0', appointmentId: 'apt-1', appointmentStatus: 'REJECTED', occurredAt: 'x', executionAbandoned: false };
    const ctx = build({
      idempotency: {
        getWithHash: vi.fn().mockResolvedValue({ response: cachedResponse, payloadHash: null }),
        set: vi.fn(),
      },
    });
    const result = await ctx.useCase.execute(baseInput);
    expect(result).toBe(cachedResponse);
    expect(ctx.fieldEventRepo.create).not.toHaveBeenCalled();
  });

  it('returns a payload-mismatch 409 for the same key with a different payload', async () => {
    const ctx = build({
      idempotency: {
        getWithHash: vi.fn().mockResolvedValue({ response: {}, payloadHash: 'different-hash' }),
        set: vi.fn(),
      },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });

  it('rolls back everything when the transition fails (no idempotency, no notify, no event)', async () => {
    const emit = vi.fn();
    const eventBus = new DomainEventBus();
    eventBus.emit = emit;
    const ctx = build({
      transition: { executeInTransaction: vi.fn().mockRejectedValue(new Error('state machine refused')) },
      notify: { notify: vi.fn() },
      eventBus,
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toThrow('state machine refused');
    expect(ctx.idempotencyService.set).not.toHaveBeenCalled();
    expect(ctx.notify.notify).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('after commit: audits cant_do, alerts operations and emits the domain event', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const eventBus = new DomainEventBus();
    eventBus.emit = emit;
    const ctx = build({ eventBus });
    await ctx.useCase.execute(baseInput);

    expect(ctx.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_field_event.cant_do',
        actorType: 'USER',
        actorId: 'user-1',
        metadata: expect.objectContaining({ reason: 'NO_ANSWER', hasNote: false, afterCheckIn: false }),
      }),
    );
    expect(ctx.notify.notify).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'apt-1', tenantId: 'tenant-1', reasonCode: 'NO_ANSWER', inspectorName: 'Jane Doe' }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: INSPECTOR_FIELD_EVENTS.RECORDED }),
    );
    // The cant_do audit never carries the note text.
    const auditLog = (ctx.auditService as unknown as { log: ReturnType<typeof vi.fn> }).log;
    const cantDoAudit = auditLog.mock.calls
      .map((c) => c[0] as { action: string; metadata: unknown })
      .find((a) => a.action === 'inspector_field_event.cant_do');
    expect(JSON.stringify(cantDoAudit!.metadata)).not.toContain('Lockbox');
  });

  it('keeps the response 200 when the operations alert fails', async () => {
    const ctx = build({ notify: { notify: vi.fn().mockRejectedValue(new Error('smtp down')) } });
    const result = await ctx.useCase.execute(baseInput);
    expect(result.appointmentStatus).toBe('REJECTED');
  });
});
