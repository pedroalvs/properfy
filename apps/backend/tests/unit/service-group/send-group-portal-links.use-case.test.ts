import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendGroupPortalLinksUseCase } from '../../../src/modules/service-group/application/use-cases/send-group-portal-links.use-case';
import type {
  IServiceGroupRepository,
  GroupAppointmentConfirmationRow,
  ServiceGroupWithAppointments,
} from '../../../src/modules/service-group/domain/service-group.repository';
import type { GeneratePortalTokenUseCase } from '../../../src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const DATE_A = new Date('2026-07-01T00:00:00.000Z');
const DATE_B = new Date('2026-07-08T00:00:00.000Z');
const SLOT = '09:00-12:00';
const FIXED_NOW = new Date('2026-06-30T02:00:00.000Z');

function row(overrides: Partial<GroupAppointmentConfirmationRow>): GroupAppointmentConfirmationRow {
  return {
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    status: 'AWAITING_INSPECTOR',
    scheduledDate: DATE_A,
    timeSlot: SLOT,
    tenantConfirmationStatus: 'PENDING',
    activeCycle: null,
    propertyCode: 'P-001',
    propertyAddress: '1 Main St',
    ...overrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function makeMocks() {
  const groupRepo = {
    findById: vi.fn().mockResolvedValue({ primaryTenantId: 'tenant-1' } as unknown as ServiceGroupWithAppointments),
    findGroupAppointmentsWithConfirmation: vi.fn().mockResolvedValue([]),
  };
  const generatePortalToken = {
    execute: vi.fn().mockResolvedValue({ dispatched: true, token: 't', expiresAt: new Date() }),
  } as unknown as GeneratePortalTokenUseCase;
  const cycleService = {
    rotateOnDateChange: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfirmationCycleService;
  const idempotency: IIdempotencyService = {
    get: vi.fn(),
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  } as unknown as IIdempotencyService;
  const auditService = { log: vi.fn() } as unknown as AuditService;
  const authorizationService = new AuthorizationService(auditService);
  const useCase = new SendGroupPortalLinksUseCase(
    groupRepo as unknown as IServiceGroupRepository,
    generatePortalToken,
    cycleService,
    idempotency,
    auditService,
    authorizationService,
    () => FIXED_NOW,
  );
  return { groupRepo, generatePortalToken, cycleService, idempotency, auditService, useCase };
}

describe('SendGroupPortalLinksUseCase', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => {
    m = makeMocks();
  });

  it('rejects a CL role before any dispatch', async () => {
    await expect(
      m.useCase.execute({ groupId: 'group-1', actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.generatePortalToken.execute).not.toHaveBeenCalled();
  });

  it('sends a PENDING appointment and records idempotency', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([row({ id: 'a1' })]);

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor(), actorTimezone: 'Australia/Sydney' });

    expect(out.results).toEqual([{ appointmentId: 'a1', status: 'SENT' }]);
    expect(m.generatePortalToken.execute).toHaveBeenCalledWith({ appointmentId: 'a1', actor: expect.any(Object) });
    // Sydney is +10/+11, so 2026-06-30T02:00Z is already 2026-06-30 noon in Sydney.
    expect(m.idempotency.set).toHaveBeenCalledWith(
      'bulk_resend:a1:2026-06-30',
      'bulk_resend_reminder',
      { appointmentId: 'a1', status: 'SENT' },
      36,
    );
  });

  it('returns IDEMPOTENT_REPLAY for a same-day cached SEND without dispatching', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([row({ id: 'a1' })]);
    (m.idempotency.getWithHash as ReturnType<typeof vi.fn>).mockResolvedValue({ response: { appointmentId: 'a1', status: 'SENT' }, payloadHash: null });

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(out.results).toEqual([{ appointmentId: 'a1', status: 'IDEMPOTENT_REPLAY' }]);
    expect(m.generatePortalToken.execute).not.toHaveBeenCalled();
  });

  it('passes through NO_PRIMARY_CONTACT and caches it', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([row({ id: 'a1' })]);
    (m.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ dispatched: false, reason: 'NO_PRIMARY_CONTACT' });

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(out.results).toEqual([{ appointmentId: 'a1', status: 'NO_PRIMARY_CONTACT' }]);
    expect(m.idempotency.set).toHaveBeenCalledWith(
      expect.any(String),
      'bulk_resend_reminder',
      { appointmentId: 'a1', status: 'NO_PRIMARY_CONTACT' },
      36,
    );
  });

  it('maps DISPATCH_FAILED to ERROR and does NOT cache it (so a retry re-sends)', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([row({ id: 'a1' })]);
    (m.generatePortalToken.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ dispatched: false, reason: 'DISPATCH_FAILED' });

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(out.results).toEqual([
      { appointmentId: 'a1', status: 'ERROR', error: { code: 'DISPATCH_FAILED', message: 'Notification dispatch failed' } },
    ]);
    expect(m.idempotency.set).not.toHaveBeenCalled();
  });

  it('skips NOT_SENDABLE and ALREADY_CONFIRMED without dispatching or recording idempotency', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'draft', status: 'DRAFT' }),
      row({ id: 'confirmed', tenantConfirmationStatus: 'CONFIRMED', activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT, status: 'CONFIRMED' } }),
    ]);

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(out.results).toEqual([
      { appointmentId: 'draft', status: 'NOT_SENDABLE' },
      { appointmentId: 'confirmed', status: 'ALREADY_CONFIRMED' },
    ]);
    expect(m.generatePortalToken.execute).not.toHaveBeenCalled();
    expect(m.idempotency.set).not.toHaveBeenCalled();
    expect(m.cycleService.rotateOnDateChange).not.toHaveBeenCalled();
  });

  it('SEND_AFTER_RESET rotates the cycle BEFORE dispatching and bypasses the idempotency read', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'stale', tenantConfirmationStatus: 'CONFIRMED', scheduledDate: DATE_B, timeSlot: SLOT, activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT, status: 'CONFIRMED' } }),
    ]);

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor(), actorTimezone: 'Australia/Sydney' });

    expect(out.results).toEqual([{ appointmentId: 'stale', status: 'DATE_CHANGED_RESENT' }]);
    // Cache READ must be bypassed for the date-changed branch.
    expect(m.idempotency.getWithHash).not.toHaveBeenCalled();
    // Rotate with the CURRENT date/time, before the dispatch.
    expect(m.cycleService.rotateOnDateChange).toHaveBeenCalledWith('stale', 'tenant-1', DATE_B, SLOT, 'DATE_CHANGED');
    const rotateOrder = (m.cycleService.rotateOnDateChange as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const dispatchOrder = (m.generatePortalToken.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(rotateOrder).toBeLessThan(dispatchOrder);
    // Still writes the cache so a second same-day click is a no-op.
    expect(m.idempotency.set).toHaveBeenCalledWith(
      'bulk_resend:stale:2026-06-30',
      'bulk_resend_reminder',
      { appointmentId: 'stale', status: 'DATE_CHANGED_RESENT' },
      36,
    );
  });

  it('isolates a per-item error and continues the batch', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'a1' }),
      row({ id: 'a2' }),
      row({ id: 'a3' }),
    ]);
    (m.generatePortalToken.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ dispatched: true })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ dispatched: true });

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor() });

    expect(out.results).toEqual([
      { appointmentId: 'a1', status: 'SENT' },
      { appointmentId: 'a2', status: 'ERROR', error: { code: 'DISPATCH_FAILED', message: 'boom' } },
      { appointmentId: 'a3', status: 'SENT' },
    ]);
  });

  it('OP drops a foreign-tenant row (no rotate, no dispatch)', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([
      row({ id: 'mine', tenantId: 'tenant-1' }),
      row({ id: 'theirs', tenantId: 'tenant-2' }),
    ]);

    const out = await m.useCase.execute({ groupId: 'group-1', actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }) });

    expect(out.results.map((r) => r.appointmentId)).toEqual(['mine']);
    expect(m.generatePortalToken.execute).toHaveBeenCalledTimes(1);
    expect(m.generatePortalToken.execute).toHaveBeenCalledWith({ appointmentId: 'mine', actor: expect.any(Object) });
  });

  it('uses the actor timezone for the per-day idempotency key', async () => {
    m.groupRepo.findGroupAppointmentsWithConfirmation.mockResolvedValue([row({ id: 'a1' })]);

    // 2026-06-30T02:00Z is 2026-06-29 22:00 in New York → day key 2026-06-29.
    await m.useCase.execute({ groupId: 'group-1', actor: makeActor(), actorTimezone: 'America/New_York' });

    expect(m.idempotency.set).toHaveBeenCalledWith(
      'bulk_resend:a1:2026-06-29',
      'bulk_resend_reminder',
      expect.any(Object),
      36,
    );
  });
});
