import { describe, it, expect, vi } from 'vitest';
import { GetAppointmentUseCase } from '../get-appointment.use-case';
import { AppointmentEntity } from '../../../domain/appointment.entity';
import { AuthorizationService } from '../../../../../shared/domain/authorization.service';
import type { AppointmentWithRelations } from '../../../domain/appointment.repository';

/**
 * Unit tests for GetAppointmentUseCase — hasActivePortalToken proxy removal (T020)
 *
 * These tests verify that the output field `hasActivePortalToken` is derived from
 * `found.hasActivePortalToken` (the real token check from the repository), NOT from
 * the stale `appointment.activeConfirmationCycleId !== null` proxy.
 *
 * Per spec §3.B2 and Regras invariant B.1: an "active token" is status='ACTIVE' AND
 * expires_at > now(), not the cycle denormalization.
 */

const OP_ACTOR = { userId: 'user-op', tenantId: 'tenant-1', branchId: null, role: 'OP' as const, inspectorId: null };

function makeAppointment(activeConfirmationCycleId: string | null = null): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-06-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    rentalTenantNote: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    activeConfirmationCycleId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeFoundResult(opts: {
  hasActivePortalToken: boolean;
  activeConfirmationCycleId?: string | null;
}): AppointmentWithRelations {
  return {
    appointment: makeAppointment(opts.activeConfirmationCycleId ?? null),
    contact: null,
    contacts: [],
    restrictions: [],
    propertyCode: 'PROP-001',
    propertyAddress: '1 Test St, Sydney NSW 2000',
    propertySuburb: 'Sydney',
    propertyLatitude: -33.8688,
    propertyLongitude: 151.2093,
    branchName: 'Test Branch',
    serviceTypeName: 'Standard',
    inspectorName: null,
    tenantName: 'Test Agency',
    tenantAppointmentCodePrefix: 'INS',
    hasActivePortalToken: opts.hasActivePortalToken,
  };
}

function makeUseCase() {
  const auth = new AuthorizationService({ log: vi.fn() } as any);
  return { auth };
}

describe('GetAppointmentUseCase — hasActivePortalToken must come from found.hasActivePortalToken', () => {
  it('should return hasActivePortalToken:true when found.hasActivePortalToken is true even if activeConfirmationCycleId is null (legacy cycle)', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ hasActivePortalToken: true, activeConfirmationCycleId: null }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.hasActivePortalToken).toBe(true);
  });

  it('should return hasActivePortalToken:false when found.hasActivePortalToken is false even if activeConfirmationCycleId is non-null (stale cycle)', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ hasActivePortalToken: false, activeConfirmationCycleId: 'cycle-1' }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    // Must use the real token check, NOT the proxy
    expect(result.hasActivePortalToken).toBe(false);
  });

  it('should propagate found.hasActivePortalToken:true verbatim (no logic in use case)', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ hasActivePortalToken: true, activeConfirmationCycleId: 'cycle-1' }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.hasActivePortalToken).toBe(true);
  });

  it('should return hasActivePortalToken:false when no token (found.hasActivePortalToken:false)', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ hasActivePortalToken: false, activeConfirmationCycleId: null }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.hasActivePortalToken).toBe(false);
  });
});
