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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

const appointmentRepo = { findOverdueActive: vi.fn(), findById: vi.fn() };
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
  appointmentRepo.findOverdueActive.mockResolvedValue([]);
  // By default the re-read confirms whatever the sweep selected.
  appointmentRepo.findById.mockImplementation(async (id: string) => {
    const found = (appointmentRepo.findOverdueActive.mock.results.at(-1)?.value as any);
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
  it('queries with UTC midnight of today\'s Sydney civil date', async () => {
    await makeUseCase().execute();

    const [beforeDate] = appointmentRepo.findOverdueActive.mock.calls[0]!;
    expect((beforeDate as Date).toISOString()).toBe('2026-07-29T00:00:00.000Z');
  });

  it('uses the Sydney date even when UTC is still on the previous day', async () => {
    // 23:00Z on the 29th is already 09:00 on the 30th in Sydney.
    vi.setSystemTime(new Date('2026-07-29T23:00:00.000Z'));
    await makeUseCase().execute();

    const [beforeDate] = appointmentRepo.findOverdueActive.mock.calls[0]!;
    expect((beforeDate as Date).toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('cancels each overdue appointment as SYS with the EXPIRED reason code', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([
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
    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1', tenantId: 'tenant-1' }),
      makeAppointment({ id: 'a-2', tenantId: 'tenant-2' }),
    ]);

    await makeUseCase().execute();

    expect(transitionUseCase.execute.mock.calls[0]![0].actor.tenantId).toBe('tenant-1');
    expect(transitionUseCase.execute.mock.calls[1]![0].actor.tenantId).toBe('tenant-2');
  });

  it('keys idempotency on the appointment and the date that expired', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-20T00:00:00.000Z') }),
    ]);

    await makeUseCase().execute();

    expect(transitionUseCase.execute.mock.calls[0]![0].idempotencyKey).toBe(
      'expire_overdue:a-1:2026-07-20',
    );
  });

  it('treats a second expiry of the same appointment on a new date as a new operation', async () => {
    // Reopened, re-dated, went stale again — an id-only key would collide with the
    // first cancellation still in the 24h idempotency cache and silently skip it.
    // Two separate sweeps, because one repository result can never repeat an id.
    const uc = makeUseCase();

    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-20T00:00:00.000Z') }),
    ]);
    await uc.execute();

    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-25T00:00:00.000Z') }),
    ]);
    await uc.execute();

    const keys = transitionUseCase.execute.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(['expire_overdue:a-1:2026-07-20', 'expire_overdue:a-1:2026-07-25']);
  });

  it('keeps going when one appointment fails, and counts the failure', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([
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

  // An operator can reschedule an appointment after findOverdueActive() has already
  // selected it. The transition use case re-checks status but not the date, so
  // without a re-read the sweep would cancel a now-future appointment as EXPIRED.
  it('skips an appointment that was rescheduled into the future mid-sweep', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1', scheduledDate: new Date('2026-07-20T00:00:00.000Z') }),
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({
        id: 'a-1',
        scheduledDate: new Date('2026-08-15T00:00:00.000Z'), // moved to the future
      }),
      contact: null,
      restrictions: [],
    });

    const result = await makeUseCase().execute();

    expect(transitionUseCase.execute).not.toHaveBeenCalled();
    expect(result.cancelledCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips an appointment that already left an active status mid-sweep', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([
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
    appointmentRepo.findOverdueActive.mockResolvedValue([makeAppointment({ id: 'a-1' })]);
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
    appointmentRepo.findOverdueActive.mockResolvedValue([
      makeAppointment({ id: 'a-1' }),
      makeAppointment({ id: 'a-2' }),
    ]);

    const result = await makeUseCase(limit).execute();

    expect(appointmentRepo.findOverdueActive.mock.calls[0]![1]).toBe(limit);
    expect(result.batchCapped).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not report a cap when the batch came back under the limit', async () => {
    appointmentRepo.findOverdueActive.mockResolvedValue([makeAppointment({ id: 'a-1' })]);

    const result = await makeUseCase(500).execute();

    expect(result.batchCapped).toBe(false);
  });
});
