/**
 * BulkResendReminderUseCase — covers the per-day idempotency key
 * (023 §FR-243) and the per-item status mapping. The platform is
 * Sydney-only: the day key comes from the shared Sydney-anchored
 * `dayKeyInTz` helper (`bulk-action-shared.ts`).
 *
 * The behavioural surface tested here is the IDEMPOTENCY KEY, not the
 * underlying SQL — the idempotency service and portal-token use case are
 * mocked. The integration test for the route + envelope lives at
 * `tests/integration/appointment/bulk-resend-reminder.routes.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkResendReminderUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-resend-reminder.use-case';
import type { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

const APPT_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000001';

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

describe('BulkResendReminderUseCase — per-day idempotency key', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
  });

  it('derives the day key from the Sydney civil date (same instant → same key)', async () => {
    const instant = new Date('2026-04-15T12:00:00Z'); // 22:00 AEST — still 2026-04-15 in Sydney
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => instant,
    );

    await useCase.execute({ appointmentIds: [APPT_ID_1], actor });
    await useCase.execute({ appointmentIds: [APPT_ID_1], actor });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(
      ([key]) => key as string,
    );
    expect(calls[0]).toBe(`bulk_resend:${APPT_ID_1}:2026-04-15`);
    // Two requests at the same instant share the same per-day bucket.
    expect(calls[1]).toBe(calls[0]);
  });

  it('rolls the day bucket at Sydney midnight, before UTC midnight', async () => {
    // 15:00Z on the 15th = 01:00 AEST on the 16th — Sydney has already rolled over.
    const useCase = new BulkResendReminderUseCase(
      mocks.generatePortalToken,
      mocks.idempotency,
      () => new Date('2026-04-15T15:00:00Z'),
    );

    await useCase.execute({ appointmentIds: [APPT_ID_1], actor });

    const [key] = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe(`bulk_resend:${APPT_ID_1}:2026-04-16`);
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
    });

    expect(out.results).toEqual([{ appointmentId: APPT_ID_1, status: 'IDEMPOTENT_REPLAY' }]);
    expect(mocks.generatePortalToken.execute).not.toHaveBeenCalled();
  });

  describe('agency blocks rental-tenant notifications', () => {
    class ConflictLike extends Error {
      constructor(readonly code: string, message: string) {
        super(message);
      }
    }

    it('reports TENANT_NOTIFICATIONS_BLOCKED instead of a generic ERROR', async () => {
      (mocks.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ConflictLike('TENANT_NOTIFICATIONS_BLOCKED', 'Notifications to the tenant are blocked for this agency.'),
      );
      const useCase = new BulkResendReminderUseCase(mocks.generatePortalToken, mocks.idempotency);

      const out = await useCase.execute({ appointmentIds: [APPT_ID_1], actor });

      expect(out.results).toEqual([{ appointmentId: APPT_ID_1, status: 'TENANT_NOTIFICATIONS_BLOCKED' }]);
      // Not cached: flipping the agency setting must allow a same-day re-run.
      expect(mocks.idempotency.set).not.toHaveBeenCalled();
    });

    it('still reports other conflicts as ERROR', async () => {
      // The narrow `code` check matters: ConflictError also carries
      // INVALID_APPOINTMENT_STATUS, which is a genuine per-item failure.
      (mocks.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ConflictLike('INVALID_APPOINTMENT_STATUS', 'Wrong status'),
      );
      const useCase = new BulkResendReminderUseCase(mocks.generatePortalToken, mocks.idempotency);

      const out = await useCase.execute({ appointmentIds: [APPT_ID_1], actor });

      expect(out.results[0].status).toBe('ERROR');
    });
  });

  // generate-portal-token returns four outcomes; everything except
  // NO_PRIMARY_CONTACT used to fall through to SENT — and got written into the
  // 36h idempotency cache, so the operator was told it went out AND a retry that
  // day was suppressed.
  describe('non-dispatched outcomes are not reported as SENT', () => {
    it('reports DISPATCH_FAILED as ERROR and does not cache it', async () => {
      const mocks = makeMocks();
      (mocks.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        token: 't', expiresAt: new Date(), dispatched: false, reason: 'DISPATCH_FAILED',
      });
      const uc = new BulkResendReminderUseCase(mocks.generatePortalToken, mocks.idempotency);

      const out = await uc.execute({ appointmentIds: ['appt-1'], actor });

      expect(out.results[0]?.status).toBe('ERROR');
      expect(mocks.idempotency.set).not.toHaveBeenCalled();
    });

    it('reports NOTIFY_DISABLED as NOT_APPLICABLE rather than SENT', async () => {
      const mocks = makeMocks();
      (mocks.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        token: 't', expiresAt: new Date(), dispatched: false, reason: 'NOTIFY_DISABLED',
      });
      const uc = new BulkResendReminderUseCase(mocks.generatePortalToken, mocks.idempotency);

      const out = await uc.execute({ appointmentIds: ['appt-1'], actor });

      expect(out.results[0]?.status).toBe('NOT_APPLICABLE');
    });

    it('still reports a real dispatch as SENT and caches it', async () => {
      const mocks = makeMocks();
      const uc = new BulkResendReminderUseCase(mocks.generatePortalToken, mocks.idempotency);

      const out = await uc.execute({ appointmentIds: ['appt-1'], actor });

      expect(out.results[0]?.status).toBe('SENT');
      expect(mocks.idempotency.set).toHaveBeenCalledTimes(1);
    });
  });
});
