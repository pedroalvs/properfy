/**
 * BulkResendReminderUseCase — covers the timezone-aware idempotency key
 * (023 §FR-243) and the per-item status mapping. Specifically guards the
 * code-review fix (Issue 3) that threads `actorTimezone` end-to-end so
 * the per-day bucket honours the operator's local "today" instead of the
 * server timezone.
 *
 * The behavioural surface tested here is the IDEMPOTENCY KEY shape, not
 * the underlying SQL — the idempotency service and portal-token use case
 * are mocked. The integration test for the route + envelope lives at
 * `tests/integration/appointment/bulk-resend-reminder.routes.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkResendReminderUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-resend-reminder.use-case';
import type { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

const APPT_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000002';

function makeMocks() {
  const generatePortalToken = {
    execute: vi.fn().mockResolvedValue({ dispatched: true, token: 't', expiresAt: new Date() }),
  } as unknown as GeneratePortalTokenUseCase;
  const idempotency: IIdempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  } as unknown as IIdempotencyService;
  return { generatePortalToken, idempotency };
}

const actor = { userId: 'u1', tenantId: null, role: 'AM' as const, branchId: null, inspectorId: null };

describe('BulkResendReminderUseCase — timezone-aware day key (Issue 3)', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
  });

  it('uses the actor timezone to compute the day key — Sydney crosses to next day before UTC', async () => {
    // 2026-04-15 13:00 UTC = 2026-04-15 23:00 Sydney → still day 15 in Sydney.
    // 2026-04-15 14:30 UTC = 2026-04-16 00:30 Sydney → already day 16 in Sydney.
    const t1330UtcSameDayInSydney = new Date('2026-04-15T13:00:00Z');
    const t1430UtcNextDayInSydney = new Date('2026-04-15T14:30:00Z');
    const useCaseT1 = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => t1330UtcSameDayInSydney,
    );
    const useCaseT2 = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => t1430UtcNextDayInSydney,
    );

    await useCaseT1.execute({ appointmentIds: [APPT_ID_1], actor, actorTimezone: 'Australia/Sydney' });
    await useCaseT2.execute({ appointmentIds: [APPT_ID_1], actor, actorTimezone: 'Australia/Sydney' });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(
      ([key]) => key as string,
    );
    expect(calls[0]).toBe(`bulk_resend:${APPT_ID_1}:2026-04-15`);
    expect(calls[1]).toBe(`bulk_resend:${APPT_ID_1}:2026-04-16`);
  });

  it('honours the actor timezone for an East-Asia operator independent of the server clock', async () => {
    // Server clock at 2026-04-15 01:00 UTC == 2026-04-15 11:00 Sydney
    //                                       == 2026-04-14 21:00 New York.
    // Same wall-clock instant produces different day keys per actor TZ.
    const sameInstant = new Date('2026-04-15T01:00:00Z');
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => sameInstant,
    );

    await useCase.execute({ appointmentIds: [APPT_ID_1], actor, actorTimezone: 'Australia/Sydney' });
    await useCase.execute({ appointmentIds: [APPT_ID_2], actor, actorTimezone: 'America/New_York' });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(
      ([key]) => key as string,
    );
    expect(calls[0]).toBe(`bulk_resend:${APPT_ID_1}:2026-04-15`);
    expect(calls[1]).toBe(`bulk_resend:${APPT_ID_2}:2026-04-14`);
  });

  it('falls back to the server TZ silently when actorTimezone is omitted', async () => {
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({ appointmentIds: [APPT_ID_1], actor });

    // Must produce SOME well-formed YYYY-MM-DD; we don't pin the exact
    // value since it depends on the test environment's TZ.
    const [key] = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toMatch(/^bulk_resend:[\da-f-]{36}:\d{4}-\d{2}-\d{2}$/);
  });

  it('an invalid timezone string falls back to UTC instead of throwing', async () => {
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_ID_1],
      actor,
      actorTimezone: 'Definitely/NotAZone',
    });

    const [key] = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe(`bulk_resend:${APPT_ID_1}:2026-04-15`);
  });

  it('marks a same-day retry as IDEMPOTENT_REPLAY without re-dispatching', async () => {
    (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      appointmentId: APPT_ID_1,
      status: 'SENT',
    });
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_ID_1],
      actor,
      actorTimezone: 'Australia/Sydney',
    });

    expect(out.results).toEqual([{ appointmentId: APPT_ID_1, status: 'IDEMPOTENT_REPLAY' }]);
    expect(mocks.generatePortalToken.execute).not.toHaveBeenCalled();
  });
});
