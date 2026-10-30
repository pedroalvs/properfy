import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReportLateNoticeUseCase } from './report-late-notice.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { DomainEventBus, INSPECTOR_FIELD_EVENTS } from '../../../../shared/application/events/domain-event-bus';

// Pinned instant: 2026-11-03T22:30:00Z === 2026-11-04 09:30 in Australia/Sydney (AEDT, +11).
// The scheduled day is therefore 2026-11-04 and the 09:00 window start is 22:00Z.
const NOW_ISO = '2026-11-03T22:30:00.000Z';
const SCHEDULED_DATE = new Date('2026-11-04T00:00:00.000Z');

const INSP = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

const TX = { __tx: true };
const buildPrismaStub = () => ({
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)),
});

interface Overrides {
  appointment?: Record<string, unknown>;
  execution?: unknown;
  idempotency?: Record<string, unknown>;
  publishedStart?: Date | null;
  eventBus?: DomainEventBus;
}

function build(overrides: Overrides = {}) {
  const fieldEventRepo = {
    create: vi.fn().mockResolvedValue(undefined),
    lockAppointmentForFieldEvent: vi.fn(),
    findLatestCantDoByAppointmentId: vi.fn(),
    findLatestCantDoByAppointmentIds: vi.fn(),
    listByAppointmentId: vi.fn(),
  };
  const executionRepo = {
    findByAppointmentId: vi.fn().mockResolvedValue(overrides.execution ?? null),
  };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
        inspectorId: 'insp-1',
        scheduledDate: SCHEDULED_DATE,
        timeSlotStart: '09:00',
        timeSlotEnd: '11:00',
        ...overrides.appointment,
      },
      inspectorName: 'Jane Doe',
    }),
  };
  const idempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ...overrides.idempotency,
  };
  const auditService = { log: vi.fn() };
  const publishedStopStartReader = {
    find: vi.fn().mockResolvedValue(overrides.publishedStart ?? null),
  };
  const tenantTimezoneLookup = {
    getTenantTimezone: vi.fn().mockResolvedValue('Australia/Sydney'),
  };
  const eventBus = overrides.eventBus ?? new DomainEventBus();
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

  const useCase = new ReportLateNoticeUseCase(
    fieldEventRepo as never,
    executionRepo as never,
    appointmentRepo as never,
    idempotencyService as never,
    auditService as never,
    new AuthorizationService(auditService as never),
    publishedStopStartReader as never,
    tenantTimezoneLookup as never,
    eventBus,
    logger,
    buildPrismaStub() as never,
  );
  return { useCase, fieldEventRepo, executionRepo, appointmentRepo, idempotencyService, auditService, publishedStopStartReader, eventBus };
}

const baseInput = {
  appointmentId: 'apt-1',
  reason: 'TRAFFIC' as const,
  minutesLate: 20,
  idempotencyKey: 'k1',
  actor: INSP,
};

describe('ReportLateNoticeUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the LATE_NOTICE and estimates arrival from the window start when there is no published plan', async () => {
    const ctx = build();
    const result = await ctx.useCase.execute(baseInput);

    expect(result).toMatchObject({
      appointmentId: 'apt-1',
      reason: 'TRAFFIC',
      minutesLate: 20,
      referenceSource: 'WINDOW_START',
      referenceAt: '2026-11-03T22:00:00.000Z', // 09:00 Sydney
      // max(windowStart 22:00, notice 22:30) + 20 = 22:50Z === 09:50 Sydney
      estimatedArrivalAt: '2026-11-03T22:50:00.000Z',
    });
    expect(ctx.fieldEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LATE_NOTICE', reasonCode: 'TRAFFIC', minutes: 20, note: null }),
      TX,
    );
    expect(ctx.idempotencyService.set).toHaveBeenCalledWith('k1', 'late-notice', result, 24, expect.any(String), TX);
  });

  it('uses the published-plan stop start as the reference when one exists', async () => {
    // 10:15 Sydney on the scheduled day === 2026-11-03T23:15:00Z.
    const ctx = build({ publishedStart: new Date('2026-11-03T23:15:00.000Z') });
    const result = await ctx.useCase.execute(baseInput);

    expect(result.referenceSource).toBe('PUBLISHED_PLAN');
    expect(result.referenceAt).toBe('2026-11-03T23:15:00.000Z');
    // max(10:15, 09:30) + 20 = 10:35 Sydney === 23:35Z
    expect(result.estimatedArrivalAt).toBe('2026-11-03T23:35:00.000Z');
  });

  it('audits and emits the domain event with the estimated arrival, without a transition or notification', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const eventBus = new DomainEventBus();
    eventBus.emit = emit;
    const ctx = build({ eventBus });
    const result = await ctx.useCase.execute(baseInput);

    expect(ctx.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_field_event.late_notice',
        metadata: expect.objectContaining({ minutesLate: 20, estimatedArrivalAt: result.estimatedArrivalAt }),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: INSPECTOR_FIELD_EVENTS.RECORDED,
        payload: expect.objectContaining({ type: 'LATE_NOTICE', estimatedArrivalAt: result.estimatedArrivalAt }),
      }),
    );
  });

  it('refuses a notice for a job that is not today in the agency timezone (past)', async () => {
    const ctx = build({ appointment: { scheduledDate: new Date('2026-11-03T00:00:00.000Z') } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'LATE_NOTICE_NOT_ALLOWED',
      message: 'You can only send a running-late notice on the day of the job.',
    });
    expect(ctx.fieldEventRepo.create).not.toHaveBeenCalled();
  });

  it('refuses a notice for a future job', async () => {
    const ctx = build({ appointment: { scheduledDate: new Date('2026-11-05T00:00:00.000Z') } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'LATE_NOTICE_NOT_ALLOWED' });
  });

  it('refuses when the inspector has already checked in', async () => {
    const ctx = build({
      execution: { isAbandoned: () => false, isFinished: () => false, isInProgress: () => true },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'LATE_NOTICE_NOT_ALLOWED',
      message: "You've already checked in to this job.",
    });
  });

  it('refuses when the execution is already finished', async () => {
    const ctx = build({
      execution: { isAbandoned: () => false, isFinished: () => true, isInProgress: () => false },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'LATE_NOTICE_NOT_ALLOWED',
      message: 'This job is already finished.',
    });
  });

  it('allows a notice when the execution was abandoned (awaiting re-offer)', async () => {
    const ctx = build({
      execution: { isAbandoned: () => true, isFinished: () => false, isInProgress: () => false },
    });
    const result = await ctx.useCase.execute(baseInput);
    expect(result.reason).toBe('TRAFFIC');
    expect(ctx.fieldEventRepo.create).toHaveBeenCalled();
  });

  it('returns 404 when the appointment is assigned to another inspector', async () => {
    const ctx = build({ appointment: { inspectorId: 'insp-2' } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('returns 404 when the appointment is not SCHEDULED', async () => {
    const ctx = build({ appointment: { status: 'DONE' } });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('rejects a non-INSP actor', async () => {
    const ctx = build();
    await expect(
      ctx.useCase.execute({ ...baseInput, actor: { ...INSP, role: 'OP' as const } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns the cached response for a repeated key', async () => {
    const cachedResponse = { eventId: 'e0', appointmentId: 'apt-1', occurredAt: 'x', reason: 'TRAFFIC', minutesLate: 20, referenceAt: 'x', referenceSource: 'WINDOW_START', estimatedArrivalAt: 'x' };
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

  it('rejects the same key replayed with a different payload', async () => {
    const ctx = build({
      idempotency: {
        getWithHash: vi.fn().mockResolvedValue({ response: {}, payloadHash: 'different' }),
        set: vi.fn(),
      },
    });
    await expect(ctx.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH',
    });
  });
});
