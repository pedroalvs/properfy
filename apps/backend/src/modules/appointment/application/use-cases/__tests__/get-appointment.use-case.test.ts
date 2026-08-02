import { describe, it, expect, vi } from 'vitest';
import { GetAppointmentUseCase } from '../get-appointment.use-case';
import { AppointmentEntity } from '../../../domain/appointment.entity';
import { AuthorizationService } from '../../../../../shared/domain/authorization.service';
import { AppointmentRestrictionEntity } from '../../../domain/appointment-restriction.entity';
import type { AppointmentWithRelations } from '../../../domain/appointment.repository';
import type { AvailableSlot } from '@properfy/shared';

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
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
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
  hasActivePortalToken?: boolean;
  activeConfirmationCycleId?: string | null;
  restrictions?: AppointmentRestrictionEntity[];
  /** Omit to exercise the "absent means enabled" default. */
  tenantRentalTenantNotificationsEnabled?: boolean;
}): AppointmentWithRelations {
  return {
    appointment: makeAppointment(opts.activeConfirmationCycleId ?? null),
    contact: null,
    contacts: [],
    restrictions: opts.restrictions ?? [],
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
    hasActivePortalToken: opts.hasActivePortalToken ?? false,
    ...(opts.tenantRentalTenantNotificationsEnabled === undefined
      ? {}
      : { tenantRentalTenantNotificationsEnabled: opts.tenantRentalTenantNotificationsEnabled }),
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

describe('GetAppointmentUseCase — restrictions must carry the availability the tenant offered', () => {
  const SLOTS: AvailableSlot[] = [
    { dayOfWeek: 'MON', start: '09:00', end: '17:00' },
    { dayOfWeek: 'WED', start: '10:00', end: '14:00' },
  ];

  function makeRestriction(availableSlotsJson: AvailableSlot[] | null): AppointmentRestrictionEntity {
    return new AppointmentRestrictionEntity({
      id: 'restriction-1',
      appointmentId: 'appt-1',
      isHome: false,
      unavailableDaysJson: null,
      unavailableHoursJson: null,
      availableSlotsJson,
      notes: null,
      source: 'RENTAL_TENANT_PORTAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async function runWith(restrictions: AppointmentRestrictionEntity[]) {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ hasActivePortalToken: false, restrictions }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);
    return uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });
  }

  // When the rental tenant answers "No" in the portal, the weekly availability they
  // pick is persisted to appointment_restrictions.available_slots_json. The presenter
  // used to rebuild each restriction field-by-field and silently drop this one, so the
  // operator never saw what the tenant offered.
  it('should expose availableSlotsJson so the operator can see the tenant availability', async () => {
    const result = await runWith([makeRestriction(SLOTS)]);

    expect(result.restrictions[0]?.availableSlotsJson).toEqual(SLOTS);
  });

  it('should expose the tenant availability at the top level of the detail response', async () => {
    const result = await runWith([makeRestriction(SLOTS)]);

    expect(result.rentalTenantAvailableSlots).toEqual(SLOTS);
  });

  it('should skip empty older restrictions when selecting top-level tenant availability', async () => {
    const result = await runWith([
      makeRestriction(null),
      makeRestriction([]),
      makeRestriction(SLOTS),
    ]);

    expect(result.rentalTenantAvailableSlots).toEqual(SLOTS);
  });

  it('should return null at the top level when every restriction has empty availability', async () => {
    const result = await runWith([makeRestriction(null), makeRestriction([])]);

    expect(result.rentalTenantAvailableSlots).toBeNull();
  });

  it('should return availableSlotsJson as null when the tenant offered no availability', async () => {
    const result = await runWith([makeRestriction(null)]);

    expect(result.restrictions[0]?.availableSlotsJson).toBeNull();
  });

  it('should keep mapping the remaining restriction fields', async () => {
    const result = await runWith([makeRestriction(SLOTS)]);

    expect(result.restrictions[0]).toMatchObject({
      id: 'restriction-1',
      isHome: false,
      notes: null,
      source: 'RENTAL_TENANT_PORTAL',
    });
  });
});

describe('GetAppointmentUseCase — appointment code', () => {
  it('should return appointmentCode formatted from tenant prefix + appointmentNumber and NOT expose a `code` alias', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeFoundResult({ hasActivePortalToken: false })),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.appointmentCode).toBe('INS-0001');
    // The detail response must not alias the property code as `code`
    // (that made import-created appointments show "IMP-…" in the UI).
    expect('code' in result).toBe(false);
  });
});

describe('GetAppointmentUseCase — rentalTenantNotificationsEnabled mapping', () => {
  // An inverted comparison here would disable "Send Portal Link" for every agency (or
  // enable it for a blocked one) and nothing else in the suite would notice.
  it('should map an explicitly disabled agency to false', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ tenantRentalTenantNotificationsEnabled: false }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.rentalTenantNotificationsEnabled).toBe(false);
  });

  it('should map an explicitly enabled agency to true', async () => {
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeFoundResult({ tenantRentalTenantNotificationsEnabled: true }),
      ),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.rentalTenantNotificationsEnabled).toBe(true);
  });

  it('should default to enabled when the repository omits the flag', async () => {
    // Absent means enabled everywhere else; defaulting to disabled here would silently
    // switch every agency off.
    const { auth } = makeUseCase();
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeFoundResult({})),
    };
    const uc = new GetAppointmentUseCase(appointmentRepo as any, auth);

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.rentalTenantNotificationsEnabled).toBe(true);
  });
});
