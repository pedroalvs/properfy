import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CancelOverdueAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/cancel-overdue-appointments.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-07-20'),
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    // Comfortably older than OVERDUE_AGE_DAYS relative to the frozen clock below, so
    // the default fixture is genuinely overdue under the age rule. This is the input
    // the rule reads — `scheduledDate` no longer participates.
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  });
}

const appointmentRepo = { findOverdueForAutoCancel: vi.fn(), findById: vi.fn() };
const transitionUseCase = { execute: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeUseCase(batchLimit?: number) {
  return new CancelOverdueAppointmentsUseCase(
    appointmentRepo as any,
    transitionUseCase as any,
    logger as any,
    batchLimit,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  transitionUseCase.execute.mockResolvedValue({ status: 'CANCELLED' });
  appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([]);
  // By default the re-read confirms whatever the sweep selected.
  appointmentRepo.findById.mockImplementation(async (id: string) => {
    const found = (appointmentRepo.findOverdueForAutoCancel.mock.results.at(-1)?.value as any);
    const list = found instanceof Promise ? await found : found;
    const appointment = (list ?? []).find((a: any) => a.id === id);
    return appointment ? { appointment, contact: null, restrictions: [] } : null;
  });
  // Fake only Date so real timers still resolve promises.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-29T02:00:00.000Z')); // midday 29 Jul in Sydney
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CancelOverdueAppointmentsUseCase', () => {
  it('queries with the Sydney-midnight instant 45 civil days back', async () => {
    await makeUseCase().execute();

    // Today in Sydney is 2026-07-29; 45 days earlier is 2026-06-14, whose Sydney
    // midnight (AEST, +10) is 14:00Z on the 13th. Not UTC midnight — `created_at` is
    // a real instant, so the cutoff has to be one too.
    const [createdBefore] = appointmentRepo.findOverdueForAutoCancel.mock.calls[0]!;
    expect((createdBefore as Date).toISOString()).toBe('2026-06-13T14:00:00.000Z');
  });

  it('uses the Sydney date even when UTC is still on the previous day', async () => {
    // 23:00Z on the 29th is already 09:00 on the 30th in Sydney, so the cutoff
    // advances a day too.
    vi.setSystemTime(new Date('2026-07-29T23:00:00.000Z'));
    await makeUseCase().execute();

    const [createdBefore] = appointmentRepo.findOverdueForAutoCancel.mock.calls[0]!;
    expect((createdBefore as Date).toISOString()).toBe('2026-06-14T14:00:00.000Z');
  });

  it('cancels each overdue appointment as SYS with the EXPIRED reason code', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', status: 'AWAITING_INSPECTOR' }),
      makeAppointment({ id: 'a-2', status: 'SCHEDULED', tenantId: 'tenant-2' }),
    ]);

    const result = await makeUseCase().execute();

    expect(result.cancelledCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(transitionUseCase.execute).toHaveBeenCalledTimes(2);

    const first = transitionUseCase.execute.mock.calls[0]![0];
    expect(first).toMatchObject({
      appointmentId: 'a-1',
      targetStatus: 'CANCELLED',
      cancellationReasonCode: 'EXPIRED',
    });
    expect(first.reason).toBeTruthy();
    expect(first.actor.role).toBe('SYS');
    // The sweep must never opt the rental tenant in: a long-past date is noise,
    // and the first run over a backlog would notify all of it at once. The agency
    // leg is unconditional inside the notification handler, so it still fires.
    expect(first.notifyRentalTenant).toBeUndefined();
  });

  it('scopes the system actor to each appointment\'s own tenant', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', tenantId: 'tenant-1' }),
      makeAppointment({ id: 'a-2', tenantId: 'tenant-2' }),
    ]);

    await makeUseCase().execute();

    expect(transitionUseCase.execute.mock.calls[0]![0].actor.tenantId).toBe('tenant-1');
    expect(transitionUseCase.execute.mock.calls[1]![0].actor.tenantId).toBe('tenant-2');
  });

  it('keys idempotency on the appointment and the run date', async () => {
    // Not on createdAt: that is immutable, so it would make the key permanently
    // constant. The key exists to make same-day re-runs no-ops, and the idempotency
    // cache lives 24h — so the run's civil date is exactly the right grain.
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([makeAppointment({ id: 'a-1' })]);

    await makeUseCase().execute();

    expect(transitionUseCase.execute.mock.calls[0]![0].idempotencyKey).toBe(
      'expire_overdue:a-1:2026-07-29',
    );
  });

  it('treats an expiry on a later day as a new operation', async () => {
    // A reopened appointment that goes stale again must not be silently skipped by a
    // key still sitting in the 24h idempotency cache.
    const uc = makeUseCase();
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([makeAppointment({ id: 'a-1' })]);

    await uc.execute();
    vi.setSystemTime(new Date('2026-07-30T02:00:00.000Z'));
    await uc.execute();

    const keys = transitionUseCase.execute.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(['expire_overdue:a-1:2026-07-29', 'expire_overdue:a-1:2026-07-30']);
  });

  it('keys on the run date regardless of the scheduled date', async () => {
    // Two appointments with different scheduled dates but the same age both key on
    // today — scheduled_date has no part in the rule any more.
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-20T00:00:00.000Z') }),
      makeAppointment({ id: 'a-2', scheduledDate: new Date('2026-12-25T00:00:00.000Z') }),
    ]);

    await makeUseCase().execute();

    const keys = transitionUseCase.execute.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(['expire_overdue:a-1:2026-07-29', 'expire_overdue:a-2:2026-07-29']);
  });

  it('keeps going when one appointment fails, and counts the failure', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1' }),
      makeAppointment({ id: 'a-2' }),
      makeAppointment({ id: 'a-3' }),
    ]);
    transitionUseCase.execute.mockRejectedValueOnce(new Error('boom'));

    const result = await makeUseCase().execute();

    expect(result.cancelledCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(transitionUseCase.execute).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalled();
  });

  // Under the age rule `created_at` is immutable, so the re-read exists purely to
  // catch a STATUS change between selection and action — an operator finishing or
  // cancelling the appointment while the batch is being processed.
  it('rescheduling into the future no longer rescues a stale appointment', async () => {
    // Deliberate behaviour change: the old scheduled-date rule let an operator escape
    // the sweep by moving the date. The age rule ignores scheduled_date, so a
    // long-stalled record is still cancelled however far ahead it is re-dated.
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-12-25T00:00:00.000Z') }),
    ]);

    const result = await makeUseCase().execute();

    expect(result.cancelledCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it('skips a candidate that is DRAFT when re-read — DRAFT is never auto-cancelled', async () => {
    // The shared predicate reports a stale DRAFT as overdue (it carries the badge), so
    // the status guard here is load-bearing: without it an operator's repair-state
    // DRAFT would be cancelled out from under them.
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', status: 'AWAITING_INSPECTOR' }),
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ id: 'a-1', status: 'DRAFT' }),
      contact: null,
      restrictions: [],
    });

    const result = await makeUseCase().execute();

    expect(transitionUseCase.execute).not.toHaveBeenCalled();
    expect(result.cancelledCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips a candidate that is no longer old enough when re-read', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1' }),
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ id: 'a-1', createdAt: new Date('2026-07-28T00:00:00.000Z') }),
      contact: null,
      restrictions: [],
    });

    const result = await makeUseCase().execute();

    expect(transitionUseCase.execute).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
  });

  it('skips an appointment that already left an active status mid-sweep', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-20T00:00:00.000Z') }),
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({
        id: 'a-1',
        scheduledDate: new Date('2026-07-20T00:00:00.000Z'),
        status: 'DONE',
      }),
      contact: null,
      restrictions: [],
    });

    const result = await makeUseCase().execute();

    expect(transitionUseCase.execute).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
  });

  it('skips an appointment that vanished mid-sweep', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([makeAppointment({ id: 'a-1' })]);
    appointmentRepo.findById.mockResolvedValue(null);

    const result = await makeUseCase().execute();

    expect(transitionUseCase.execute).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
  });

  it('does nothing and reports zero when there is nothing overdue', async () => {
    const result = await makeUseCase().execute();

    expect(result).toEqual({
      cancelledCount: 0, failedCount: 0, skippedCount: 0, batchCapped: false,
    });
    expect(transitionUseCase.execute).not.toHaveBeenCalled();
  });

  it('caps the batch and reports the cap rather than silently truncating', async () => {
    const limit = 2;
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([
      makeAppointment({ id: 'a-1' }),
      makeAppointment({ id: 'a-2' }),
    ]);

    const result = await makeUseCase(limit).execute();

    expect(appointmentRepo.findOverdueForAutoCancel.mock.calls[0]![1]).toBe(limit);
    expect(result.batchCapped).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not report a cap when the batch came back under the limit', async () => {
    appointmentRepo.findOverdueForAutoCancel.mockResolvedValue([makeAppointment({ id: 'a-1' })]);

    const result = await makeUseCase(500).execute();

    expect(result.batchCapped).toBe(false);
  });
});
