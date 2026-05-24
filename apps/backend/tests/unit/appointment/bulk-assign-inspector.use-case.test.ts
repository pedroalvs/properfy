/**
 * BulkAssignInspectorUseCase (025 §FR-441) — delegates per-item to
 * `BulkEditAppointmentsUseCase` with `{ assignedInspectorId }`. The
 * delegate returns a `{ failed[] }` envelope (not exceptions for per-row
 * failures), so the bulk wrapper must translate `failed[0]` into the
 * standard typed result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkAssignInspectorUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-assign-inspector.use-case';
import type { BulkEditAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000001000';
const APPT_B = 'bbbbbbbb-0000-4000-8000-000000002000';
const INSPECTOR_ID = 'cccccccc-0000-4000-8000-000000001111';

const actor = {
  userId: 'op-1',
  tenantId: null,
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

function makeMocks() {
  const bulkEditAppointments = {
    execute: vi.fn().mockResolvedValue({ updated: 1, failed: [] }),
  } as unknown as BulkEditAppointmentsUseCase;
  const idempotency: IIdempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  } as unknown as IIdempotencyService;
  return { bulkEditAppointments, idempotency };
}

describe('BulkAssignInspectorUseCase', () => {
  let mocks: ReturnType<typeof makeMocks>;
  beforeEach(() => { mocks = makeMocks(); });

  it('delegates per-item to BulkEditAppointmentsUseCase with assignedInspectorId', async () => {
    const useCase = new BulkAssignInspectorUseCase(
      mocks.bulkEditAppointments,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      inspectorId: INSPECTOR_ID,
      actor,
    });

    expect(mocks.bulkEditAppointments.execute).toHaveBeenCalledTimes(2);
    expect(mocks.bulkEditAppointments.execute).toHaveBeenNthCalledWith(1, {
      ids: [APPT_A],
      changes: { assignedInspectorId: INSPECTOR_ID },
      actor,
    });
  });

  it('idempotency key includes the inspectorId so reassign re-executes', async () => {
    const useCase = new BulkAssignInspectorUseCase(
      mocks.bulkEditAppointments,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({ appointmentIds: [APPT_A], inspectorId: INSPECTOR_ID, actor, actorTimezone: 'Australia/Sydney' });
    await useCase.execute({ appointmentIds: [APPT_A], inspectorId: 'dddddddd-0000-4000-8000-000000000099', actor, actorTimezone: 'Australia/Sydney' });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(([k]) => k as string);
    expect(calls[0]).toBe(`bulk_assign_inspector:${APPT_A}:${INSPECTOR_ID}:2026-04-15`);
    expect(calls[1]).toBe(`bulk_assign_inspector:${APPT_A}:dddddddd-0000-4000-8000-000000000099:2026-04-15`);
  });

  it('translates BulkEdit failed[] entries to typed per-item statuses', async () => {
    (mocks.bulkEditAppointments.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ updated: 1, failed: [] })
      .mockResolvedValueOnce({
        updated: 0,
        failed: [{ id: APPT_B, code: 'INSPECTOR_NOT_ELIGIBLE', message: 'not eligible' }],
      });

    const useCase = new BulkAssignInspectorUseCase(
      mocks.bulkEditAppointments,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      inspectorId: INSPECTOR_ID,
      actor,
    });

    expect(out.results[0]?.status).toBe('OK');
    expect(out.results[1]?.status).toBe('FORBIDDEN');
    expect(out.results[1]?.error?.code).toBe('INSPECTOR_NOT_ELIGIBLE');
  });

  it('treats ForbiddenError thrown by delegate as FORBIDDEN', async () => {
    (mocks.bulkEditAppointments.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ForbiddenError('FORBIDDEN', 'AM or OP only'),
    );
    const useCase = new BulkAssignInspectorUseCase(
      mocks.bulkEditAppointments,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      inspectorId: INSPECTOR_ID,
      actor: { ...actor, role: 'CL_ADMIN' },
    });

    expect(out.results[0]?.status).toBe('FORBIDDEN');
  });

  it('IDEMPOTENT_REPLAY skips the delegate on same-day same-inspector retry', async () => {
    (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      appointmentId: APPT_A,
      status: 'OK',
    });
    const useCase = new BulkAssignInspectorUseCase(
      mocks.bulkEditAppointments,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      inspectorId: INSPECTOR_ID,
      actor,
    });

    expect(out.results[0]?.status).toBe('IDEMPOTENT_REPLAY');
    expect(mocks.bulkEditAppointments.execute).not.toHaveBeenCalled();
  });
});
