import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext, AvailableSlot } from '@properfy/shared';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import {
  AppointmentNotFoundError,
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
  AppointmentDateInPastError,
  AppointmentInServiceGroupError,
  AppointmentTimeSlotOutsideGroupWindowError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeAppointmentEntity(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'DRAFT',
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
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

function makeContact(): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = false,
  restrictions: AppointmentRestrictionEntity[] = [],
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: withContact ? makeContact() : null,
    restrictions,
  };
}

/** A restriction row as written by the portal when the rental tenant declines. */
function makePortalRestriction(availableSlotsJson: AvailableSlot[]): AppointmentRestrictionEntity {
  return new AppointmentRestrictionEntity({
    id: 'restriction-portal',
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

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('UpdateAppointmentUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let useCase: UpdateAppointmentUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      updateContactSnapshot: vi.fn(),
      deleteContactsByAppointmentId: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateAppointmentUseCase(appointmentRepo, auditService, new AuthorizationService(auditService));
  });

  it('should update a DRAFT appointment successfully', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    // Only update non-temporal fields so validateEditedSchedule short-circuits (no date/time change).
    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        notes: 'Updated notes',
      },
      actor: makeActor(),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ notes: 'Updated notes' }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.updated',
        before: expect.any(Object),
        after: expect.any(Object),
      }),
    );
  });

  it('should update an AWAITING_INSPECTOR appointment successfully', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: { keyRequired: true },
      actor: makeActor(),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.update).toHaveBeenCalled();
  });

  it('should update a SCHEDULED appointment keeping status and inspector', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: { scheduledDate: '2099-04-10' },
      actor: makeActor(),
    });

    expect(result.status).toBe('SCHEDULED');
    expect(result.inspectorId).toBe('insp-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ scheduledDate: new Date('2099-04-10') }),
    );
    const updateArg = vi.mocked(appointmentRepo.update).mock.calls[0]![2];
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg).not.toHaveProperty('inspectorId');
  });

  it('should update a REJECTED appointment successfully', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'REJECTED' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: { scheduledDate: '2099-04-10' },
      actor: makeActor(),
    });

    expect(result.status).toBe('REJECTED');
    expect(appointmentRepo.update).toHaveBeenCalled();
  });

  it('should fail to update a DONE appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
  });

  it('should fail to update a CANCELLED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'CANCELLED' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
  });

  it('should update existing contact (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true),
    );

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        contact: {
          rentalTenantName: 'Jane Doe',
          primaryEmail: 'jane@example.com',
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalledWith(
      'appt-1',
      'contact-1',
      expect.objectContaining({ snapshotName: 'Jane Doe' }),
    );
    expect(appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('should create new contact when contact does not exist (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false),
    );

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        contact: {
          rentalTenantName: 'New Contact',
          primaryEmail: 'new@example.com',
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.saveContact).toHaveBeenCalled();
    expect(appointmentRepo.updateContact).not.toHaveBeenCalled();
  });

  it('should delete restriction and create new one (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        restriction: {
          isHome: true,
          source: 'OPERATOR',
          unavailableDays: ['2026-04-05'],
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalled();
  });

  it('should delete restriction when restriction is set to null', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        restriction: null,
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  // The weekly availability a rental tenant offers when declining in the portal lives on
  // the restriction row but is not part of the operator's restriction form. The
  // delete-then-recreate below must not silently discard it.
  describe('rental tenant availability preservation', () => {
    const SLOTS: AvailableSlot[] = [
      { dayOfWeek: 'WED', start: '09:00', end: '17:00' },
      { dayOfWeek: 'FRI', start: '10:00', end: '14:00' },
    ];

    it('should carry the tenant availability onto the operator-edited restriction', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({}, false, [makePortalRestriction(SLOTS)]),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: {
          restriction: { isHome: true, source: 'OPERATOR', notes: 'Ring the bell' },
        },
        actor: makeActor(),
      });

      const saved = vi.mocked(appointmentRepo.saveRestriction).mock.calls[0]?.[0];
      expect(saved?.availableSlotsJson).toEqual(SLOTS);
      // The operator's own edits must still land.
      expect(saved?.isHome).toBe(true);
      expect(saved?.notes).toBe('Ring the bell');
    });

    it('should keep the tenant availability when the operator removes their restriction', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({}, false, [makePortalRestriction(SLOTS)]),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { restriction: null },
        actor: makeActor(),
      });

      const saved = vi.mocked(appointmentRepo.saveRestriction).mock.calls[0]?.[0];
      expect(saved?.availableSlotsJson).toEqual(SLOTS);
      // Nothing operator-authored survives — only the tenant's own contribution.
      expect(saved?.isHome).toBe(false);
      expect(saved?.notes).toBeNull();
      expect(saved?.source).toBe('RENTAL_TENANT_PORTAL');
    });

    it('should leave availableSlotsJson null when the tenant never offered any', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { restriction: { isHome: true, source: 'OPERATOR' } },
        actor: makeActor(),
      });

      const saved = vi.mocked(appointmentRepo.saveRestriction).mock.calls[0]?.[0];
      expect(saved?.availableSlotsJson).toBeNull();
    });
  });

  it('should not touch restrictions when restriction field is absent', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: { notes: 'Just notes' },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).not.toHaveBeenCalled();
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should include before and after in audit log', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: { notes: 'Changed notes' },
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.updated',
        before: expect.objectContaining({ notes: null }),
        after: expect.objectContaining({ notes: 'Changed notes' }),
      }),
    );
  });

  describe('observation field', () => {
    it('persists observation via the repository update payload', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { observation: 'On-site key under the mat' },
        actor: makeActor(),
      });

      expect(result.observation).toBe('On-site key under the mat');
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ observation: 'On-site key under the mat' }),
      );
    });

    it('emits a dedicated appointment.observation_updated audit entry on change', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ observation: 'old value' }),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { observation: 'new value' },
        actor: makeActor(),
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.observation_updated',
          entityType: 'Appointment',
          entityId: 'appt-1',
          before: { observation: 'old value' },
          after: { observation: 'new value' },
        }),
      );
    });

    it('emits the dedicated audit entry when clearing observation to null', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ observation: 'something' }),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { observation: null },
        actor: makeActor(),
      });

      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ observation: null }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.observation_updated',
          before: { observation: 'something' },
          after: { observation: null },
        }),
      );
    });

    it('does NOT emit the dedicated audit entry when observation is unchanged', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ observation: 'same' }),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { observation: 'same' },
        actor: makeActor(),
      });

      expect(auditService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'appointment.observation_updated' }),
      );
    });

    it('does NOT emit the dedicated audit entry when observation is absent from the payload', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ observation: 'kept' }),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'only notes changed' },
        actor: makeActor(),
      });

      expect(auditService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'appointment.observation_updated' }),
      );
    });
  });

  describe('customFields', () => {
    it('persists the customFields array via the repository update payload', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const customFields = [
        { label: 'Gate code', value: '1234' },
        { label: 'Parking', value: 'Level 2' },
      ];
      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { customFields },
        actor: makeActor(),
      });

      expect(result.customFieldsJson).toEqual(customFields);
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ customFieldsJson: customFields }),
      );
    });

    it('clears custom fields when passed null', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: [{ label: 'Gate', value: '1' }] }),
      );

      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { customFields: null },
        actor: makeActor(),
      });

      expect(result.customFieldsJson).toBeNull();
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ customFieldsJson: null }),
      );
    });

    it('clears custom fields when passed an empty array', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: [{ label: 'Gate', value: '1' }] }),
      );

      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { customFields: [] },
        actor: makeActor(),
      });

      expect(result.customFieldsJson).toEqual([]);
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ customFieldsJson: [] }),
      );
    });

    it('leaves custom fields untouched when the field is absent', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: [{ label: 'Gate', value: '1' }] }),
      );

      await useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'only notes' },
        actor: makeActor(),
      });

      const updateArg = vi.mocked(appointmentRepo.update).mock.calls[0]![2];
      expect(updateArg).not.toHaveProperty('customFieldsJson');
    });
  });

  it('reflects clearing a nullable field to null in both the audit after-state and the response', async () => {
    // Regression: the old `updateData.X ?? appointment.X` pattern resurrected the
    // previous value on clear-to-null, so the audit claimed "unchanged" and the
    // PATCH response returned the stale value despite the DB storing null.
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ notes: 'old note', meetingLocation: 'Front gate' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: { notes: null, meetingLocation: null },
      actor: makeActor(),
    });

    expect(result.notes).toBeNull();
    expect(result.meetingLocation).toBeNull();
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ notes: null, meetingLocation: null }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.updated',
        before: expect.objectContaining({ notes: 'old note', meetingLocation: 'Front gate' }),
        after: expect.objectContaining({ notes: null, meetingLocation: null }),
      }),
    );
  });

  it('should throw AppointmentNotFoundError when appointment does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'nonexistent',
        data: { notes: 'whatever' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should deny INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: {},
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should deny CL_ADMIN access to appointment from different tenant', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'hacking' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  // Past date prevention
  describe('past date prevention', () => {
    it('should reject past scheduledDate for CL_ADMIN', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2020-01-01' },
          actor: makeActor({ role: 'CL_ADMIN' }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    // Cycle 6: AM/OP past-date exemption removed — universal rejection for all roles.
    it('should reject past scheduledDate for AM', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2020-01-01' },
          actor: makeActor({ role: 'AM', tenantId: null }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    it('should reject past scheduledDate for OP', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2020-01-01' },
          actor: makeActor({ role: 'OP', tenantId: null }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    it('should accept today for CL_ADMIN', async () => {
      // Freeze time before the existing appointment's time slot (09:00 Sydney)
      // so the slot-in-past check does not fire when rescheduling to today.
      vi.useFakeTimers({ now: zonedWallTimeToUtc('2026-06-15', '07:00', PLATFORM_TIMEZONE) });
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const today = '2026-06-15'; // matches frozen Sydney civil date
      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: today },
        actor: makeActor({ role: 'CL_ADMIN' }),
      });

      expect(result.id).toBe('appt-1');
      vi.useRealTimers();
    });

    it('should not check past date when scheduledDate is not provided', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const result = await useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'just a note' },
        actor: makeActor({ role: 'CL_ADMIN' }),
      });

      expect(result.id).toBe('appt-1');
    });
  });

  // H6: CL_USER reschedule permission
  describe('CL_USER reschedule_appointments permission', () => {
    let authzService: AuthorizationService;
    beforeEach(() => {
      authzService = new AuthorizationService(auditService);
    });

    it('should allow CL_USER to reschedule with permission', async () => {
      const uc = new UpdateAppointmentUseCase(appointmentRepo, auditService, authzService);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureDateStr = futureDate.toISOString().split('T')[0]!;

      const result = await uc.execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: futureDateStr },
        actor: makeActor({ role: 'CL_USER', clUserPermissions: ['reschedule_appointments'] }),
      });
      expect(result.id).toBe('appt-1');
    });

    it('should throw ForbiddenError for CL_USER without reschedule_appointments permission', async () => {
      const uc = new UpdateAppointmentUseCase(appointmentRepo, auditService, authzService);

      await expect(
        uc.execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2026-04-15' },
          actor: makeActor({ role: 'CL_USER', clUserPermissions: [] }),
        }),
      ).rejects.toThrow('CL_USER does not have reschedule_appointments permission');
    });

    it('should allow CL_USER to update non-schedule fields without permission', async () => {
      const uc = new UpdateAppointmentUseCase(appointmentRepo, auditService, authzService);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const result = await uc.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Just a note' },
        actor: makeActor({ role: 'CL_USER', clUserPermissions: [] }),
      });
      expect(result.id).toBe('appt-1');
    });
  });

  // Schedule change on any non-terminal status: confirmation reset + token revoke + notify
  describe('schedule change side effects', () => {
    let cycleService: { rotateOnDateChange: ReturnType<typeof vi.fn> };
    let tokenRepo: { revokeAllForAppointment: ReturnType<typeof vi.fn> };
    let notifyHandler: { execute: ReturnType<typeof vi.fn> };

    function makeUseCase() {
      return new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        undefined,
        undefined,
        cycleService as never,
        tokenRepo as never,
        notifyHandler as never,
      );
    }

    beforeEach(() => {
      cycleService = { rotateOnDateChange: vi.fn().mockResolvedValue(undefined) };
      tokenRepo = { revokeAllForAppointment: vi.fn().mockResolvedValue(undefined) };
      notifyHandler = { execute: vi.fn().mockResolvedValue(undefined) };
    });

    it('rotates the confirmation cycle when an active cycle exists and the date changed', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'SCHEDULED',
          activeConfirmationCycleId: 'cycle-1',
          rentalTenantConfirmationStatus: 'CONFIRMED',
        }),
      );

      const result = await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(cycleService.rotateOnDateChange).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        new Date('2099-04-10'),
        '09:00-10:00',
        'DATE_CHANGED',
      );
      expect(result.rentalTenantConfirmationStatus).toBe('PENDING');
      // Conservative ordering: reset runs BEFORE the date is persisted, so a
      // partial failure leaves the old date in place and a retry re-detects
      // the change (a stale CONFIRMED cycle can never survive).
      expect(cycleService.rotateOnDateChange.mock.invocationCallOrder[0]!).toBeLessThan(
        vi.mocked(appointmentRepo.update).mock.invocationCallOrder[0]!,
      );
    });

    it('rotates with TIME_CHANGED when only the time slot changed', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'SCHEDULED',
          activeConfirmationCycleId: 'cycle-1',
          scheduledDate: new Date('2099-04-01'),
        }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { timeSlotStart: '14:00', timeSlotEnd: '15:00' },
        actor: makeActor(),
      });

      expect(cycleService.rotateOnDateChange).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        new Date('2099-04-01'),
        '14:00-15:00',
        'TIME_CHANGED',
      );
    });

    it('resets the denormalized confirmation status when no active cycle exists', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'SCHEDULED',
          activeConfirmationCycleId: null,
          rentalTenantConfirmationStatus: 'CONFIRMED',
        }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(cycleService.rotateOnDateChange).not.toHaveBeenCalled();
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ rentalTenantConfirmationStatus: 'PENDING' }),
      );
    });

    it('revokes portal tokens and audits the revocation', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'SCHEDULED' }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(tokenRepo.revokeAllForAppointment).toHaveBeenCalledWith('appt-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rental_tenant_portal.tokens_revoked',
          tenantId: 'tenant-1',
          entityId: 'appt-1',
        }),
      );
    });

    it('notifies the rental tenant when a SCHEDULED appointment is rescheduled', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'SCHEDULED' }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(notifyHandler.execute).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
      });
    });

    it('does NOT notify when a DRAFT appointment date changes', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'DRAFT' }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(notifyHandler.execute).not.toHaveBeenCalled();
    });

    // The schedule change revokes the tenant's portal tokens unconditionally.
    // Gating the replacement notification on SCHEDULED alone left every other
    // already-notified status (notably grouped AWAITING_INSPECTOR rows) holding
    // a dead link and a stale time, silently.
    it('notifies a non-SCHEDULED appointment whose tenant had already confirmed', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          rentalTenantConfirmationStatus: 'CONFIRMED',
        }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(notifyHandler.execute).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
      });
    });

    it('notifies a non-SCHEDULED appointment that has an active confirmation cycle', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          activeConfirmationCycleId: 'cycle-1',
          rentalTenantConfirmationStatus: 'PENDING',
        }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(notifyHandler.execute).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
      });
    });

    it('stays silent for an AWAITING_INSPECTOR appointment the tenant was never told about', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          activeConfirmationCycleId: null,
          rentalTenantConfirmationStatus: 'PENDING',
        }),
      );

      await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(notifyHandler.execute).not.toHaveBeenCalled();
    });

    it('does not fail the update when the notification handler throws', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'SCHEDULED' }),
      );
      notifyHandler.execute.mockRejectedValue(new Error('smtp down'));

      const result = await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-10' },
        actor: makeActor(),
      });

      expect(result.id).toBe('appt-1');
    });

    it('runs no side effects when submitted date/time equal current values', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'SCHEDULED',
          activeConfirmationCycleId: 'cycle-1',
          scheduledDate: new Date('2099-04-01'),
          rentalTenantConfirmationStatus: 'CONFIRMED',
        }),
      );

      const result = await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-01', timeSlotStart: '09:00', timeSlotEnd: '10:00' },
        actor: makeActor(),
      });

      expect(cycleService.rotateOnDateChange).not.toHaveBeenCalled();
      expect(tokenRepo.revokeAllForAppointment).not.toHaveBeenCalled();
      expect(notifyHandler.execute).not.toHaveBeenCalled();
      expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    });

    it('rejects a schedule change when the appointment belongs to a service group', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'SCHEDULED', serviceGroupId: 'group-1' }),
      );

      await expect(
        makeUseCase().execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-10' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
    });

    it('allows non-schedule edits on an appointment in a service group', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'SCHEDULED', serviceGroupId: 'group-1' }),
      );

      const result = await makeUseCase().execute({
        appointmentId: 'appt-1',
        data: { notes: 'group note' },
        actor: makeActor(),
      });

      expect(result.id).toBe('appt-1');
    });
  });

  describe('schedule edits on a grouped appointment', () => {
    function makeUseCaseWithGroupRepo(serviceGroupRepo: {
      findById: ReturnType<typeof vi.fn>;
      update?: ReturnType<typeof vi.fn>;
    }) {
      return new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceGroupRepo as never,
      );
    }

    function makeGroupResult(
      timeWindow: string,
      groupOverrides: { status?: string; scheduledDate?: Date } = {},
    ) {
      return {
        group: {
          timeWindow,
          status: 'PUBLISHED',
          scheduledDate: new Date('2099-04-01'),
          ...groupOverrides,
        },
        assignedInspectorName: null,
        tenantIds: ['tenant-1'],
        primaryTenantId: 'tenant-1',
        agencies: [],
        appointments: [],
      };
    }

    it('allows a time-slot change that still fits inside the group time window', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );
      const serviceGroupRepo = { findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')) };

      const result = await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
        appointmentId: 'appt-1',
        data: { timeSlotStart: '09:30', timeSlotEnd: '11:00' },
        actor: makeActor(),
      });

      expect(result.id).toBe('appt-1');
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ timeSlotStart: '09:30', timeSlotEnd: '11:00' }),
      );
    });

    // `expandGroupTimeWindow` opt-in: the operator asked for the time, so the
    // group's shared window follows instead of rejecting. Status and inspector
    // must survive untouched — that is the whole point of routing reschedules
    // here rather than through ReopenForRescheduleUseCase.
    describe('expandGroupTimeWindow', () => {
      function makeGroupedAppointment(status = 'AWAITING_INSPECTOR') {
        return makeAppointmentWithRelations({
          status,
          inspectorId: 'inspector-1',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        });
      }

      it('widens the group window and leaves status and inspector untouched', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
          update: vi.fn().mockResolvedValue(undefined),
        };

        const result = await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
          expandGroupTimeWindow: true,
          actor: makeActor(),
        });

        expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', { timeWindow: '08:00-14:00' });
        expect(appointmentRepo.update).toHaveBeenCalledWith(
          'appt-1',
          'tenant-1',
          expect.objectContaining({ timeSlotStart: '13:00', timeSlotEnd: '14:00' }),
        );
        // The appointment write must not carry a status or inspector change.
        const updatePayload = vi.mocked(appointmentRepo.update).mock.calls[0]![2];
        expect(updatePayload).not.toHaveProperty('status');
        expect(updatePayload).not.toHaveProperty('inspectorId');
        expect(result.status).toBe('AWAITING_INSPECTOR');
        expect(result.inspectorId).toBe('inspector-1');
      });

      it('audits the widening with the before and after windows', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '07:00', timeSlotEnd: '09:30' },
          expandGroupTimeWindow: true,
          actor: makeActor(),
        });

        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'service_group.time_window_expanded',
            entityType: 'ServiceGroup',
            entityId: 'group-1',
            before: { timeWindow: '08:00-12:00' },
            after: { timeWindow: '07:00-12:00' },
            metadata: expect.objectContaining({ appointmentId: 'appt-1', initiatedBy: 'CL_ADMIN' }),
          }),
        );
      });

      it('widens the window of an ACCEPTED group', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00', { status: 'ACCEPTED' })),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
          expandGroupTimeWindow: true,
          actor: makeActor(),
        });

        expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', { timeWindow: '08:00-14:00' });
      });

      it.each(['CANCELLED', 'REJECTED'])(
        'still rejects the edit when the group is %s — there is nothing to widen',
        async (groupStatus) => {
          vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
          const serviceGroupRepo = {
            findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00', { status: groupStatus })),
            update: vi.fn().mockResolvedValue(undefined),
          };

          await expect(
            makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
              appointmentId: 'appt-1',
              data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
              expandGroupTimeWindow: true,
              actor: makeActor(),
            }),
          ).rejects.toThrow(AppointmentTimeSlotOutsideGroupWindowError);
          expect(serviceGroupRepo.update).not.toHaveBeenCalled();
          expect(appointmentRepo.update).not.toHaveBeenCalled();
        },
      );

      // Ordering guard: the widening must outlive nothing. It is persisted only
      // after the appointment write succeeds, so a rejection anywhere later
      // cannot leave a shared window stretched for an edit that never landed.
      it('does not widen the group window when the appointment write fails', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        vi.mocked(appointmentRepo.update).mockRejectedValue(new Error('db down'));
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
            appointmentId: 'appt-1',
            data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
            expandGroupTimeWindow: true,
            actor: makeActor(),
          }),
        ).rejects.toThrow('db down');

        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'service_group.time_window_expanded' }),
        );
      });

      it('does not widen the group window when the new time is in the past', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(
          makeAppointmentWithRelations({
            status: 'AWAITING_INSPECTOR',
            serviceGroupId: 'group-1',
            // Past date: validateEditedSchedule rejects AFTER the group check.
            scheduledDate: new Date('2020-01-01'),
            timeSlotStart: '09:00',
            timeSlotEnd: '10:00',
          }),
        );
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(
            makeGroupResult('08:00-12:00', { scheduledDate: new Date('2020-01-01') }),
          ),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
            appointmentId: 'appt-1',
            data: { scheduledDate: '2020-01-02', timeSlotStart: '13:00', timeSlotEnd: '14:00' },
            expandGroupTimeWindow: true,
            actor: makeActor(),
          }),
        ).rejects.toThrow();

        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
      });

      it('does not touch the group when the new slot already fits', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '10:30', timeSlotEnd: '11:30' },
          expandGroupTimeWindow: true,
          actor: makeActor(),
        });

        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'service_group.time_window_expanded' }),
        );
      });

      // Opt-in only: callers that never asked (e.g. the list page's bulk edit)
      // keep the pre-existing 422 rather than silently widening a shared window.
      it('keeps rejecting when the caller did not opt in', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(makeGroupedAppointment());
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
            appointmentId: 'appt-1',
            data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
            actor: makeActor(),
          }),
        ).rejects.toThrow(AppointmentTimeSlotOutsideGroupWindowError);
        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
      });

      it('does not widen the window for a date-only realignment', async () => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue(
          makeAppointmentWithRelations({
            status: 'AWAITING_INSPECTOR',
            serviceGroupId: 'group-1',
            scheduledDate: new Date('2099-04-05'),
            timeSlotStart: '09:00',
            timeSlotEnd: '10:00',
          }),
        );
        const serviceGroupRepo = {
          findById: vi.fn().mockResolvedValue(
            makeGroupResult('08:00-12:00', { status: 'DRAFT', scheduledDate: new Date('2099-04-01') }),
          ),
          update: vi.fn().mockResolvedValue(undefined),
        };

        await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-01' },
          expandGroupTimeWindow: true,
          actor: makeActor(),
        });

        expect(serviceGroupRepo.update).not.toHaveBeenCalled();
      });
    });

    // Service groups are cross-tenant, so the map's group reschedule can hand
    // this use case an appointment from any agency. OP tokens carry
    // `tenantId: null` by design (see auth-middleware.ts), which makes the
    // repository lookup platform-wide. Pinned here because the map flow depends
    // on it: assigning OP users a tenant_id would silently 404 mixed groups.
    it('lets an OP reschedule an appointment in another agency (cross-tenant group)', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          tenantId: 'tenant-2',
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );
      const serviceGroupRepo = {
        findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')),
        update: vi.fn().mockResolvedValue(undefined),
      };

      const result = await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
        appointmentId: 'appt-1',
        data: { timeSlotStart: '10:30', timeSlotEnd: '11:30' },
        actor: makeActor({ role: 'OP', tenantId: null }),
      });

      expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
      expect(result.tenantId).toBe('tenant-2');
    });

    it('rejects a time-slot change that falls outside the group time window', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );
      const serviceGroupRepo = { findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00')) };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentTimeSlotOutsideGroupWindowError);
      expect(appointmentRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a date change on an appointment in a non-DRAFT group', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status: 'AWAITING_INSPECTOR', serviceGroupId: 'group-1' }),
      );
      const serviceGroupRepo = {
        findById: vi.fn().mockResolvedValue(makeGroupResult('08:00-12:00', { status: 'PUBLISHED' })),
      };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-10' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
    });

    it('rejects a date change matching the group date when the group is not DRAFT', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-05'),
        }),
      );
      const serviceGroupRepo = {
        findById: vi.fn().mockResolvedValue(
          makeGroupResult('08:00-12:00', { status: 'PUBLISHED', scheduledDate: new Date('2099-04-01') }),
        ),
      };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-01' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
    });

    it('allows realigning a divergent appointment to the group date while the group is DRAFT', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-05'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );
      const serviceGroupRepo = {
        findById: vi.fn().mockResolvedValue(
          makeGroupResult('08:00-12:00', { status: 'DRAFT', scheduledDate: new Date('2099-04-01') }),
        ),
      };

      const result = await makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
        appointmentId: 'appt-1',
        data: { scheduledDate: '2099-04-01' },
        actor: makeActor(),
      });

      expect(result.id).toBe('appt-1');
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ scheduledDate: new Date('2099-04-01') }),
      );
    });

    it('rejects a date change that diverges from the group date even while the group is DRAFT', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
        }),
      );
      const serviceGroupRepo = {
        findById: vi.fn().mockResolvedValue(
          makeGroupResult('08:00-12:00', { status: 'DRAFT', scheduledDate: new Date('2099-04-01') }),
        ),
      };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-10' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
      expect(appointmentRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a date change when the group cannot be loaded (fail-closed)', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-05'),
        }),
      );
      const serviceGroupRepo = { findById: vi.fn().mockResolvedValue(null) };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { scheduledDate: '2099-04-01' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
    });

    // Both cases below fail CLOSED: any schedule edit on a grouped appointment
    // requires the group to be loaded (serviceGroupRepo is always wired in
    // production — container.ts); when it can't be, the edit is blocked.
    it('rejects a time-slot change when serviceGroupRepo is not wired (fail-closed)', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
      expect(appointmentRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a time-slot change when serviceGroupRepo.findById returns null (fail-closed)', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({
          status: 'AWAITING_INSPECTOR',
          serviceGroupId: 'group-1',
          scheduledDate: new Date('2099-04-01'),
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        }),
      );
      const serviceGroupRepo = { findById: vi.fn().mockResolvedValue(null) };

      await expect(
        makeUseCaseWithGroupRepo(serviceGroupRepo).execute({
          appointmentId: 'appt-1',
          data: { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentInServiceGroupError);
      expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', null);
      expect(appointmentRepo.update).not.toHaveBeenCalled();
    });
  });

  // Regression: Bug B-1 (QA round 2026-04-18).
  // PATCH /v1/appointments/:id returned 500 when the frontend replayed an
  // inline contact whose email or phone already existed as an active registry
  // row — the inline branch called contactRepo.save() blindly and hit the
  // contacts_tenant_email_active_unique / ..._phone_active_unique partial
  // indexes. The fix reuses the matching registry row instead of creating a
  // duplicate.
  describe('inline contact reuse (Bug B-1 regression)', () => {
    const tenantId = 'tenant-1';
    const appointmentId = 'appt-1';

    function makeContactRepo(candidates: unknown[]) {
      return {
        findById: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        search: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        existsByEmail: vi.fn(),
        existsByPhone: vi.fn(),
        findManyActiveByEmailsOrPhones: vi.fn().mockResolvedValue(candidates),
        findAppointmentsByContactId: vi.fn(),
        countAppointmentsByContactId: vi.fn(),
      };
    }

    it('reuses an existing active contact when the inline payload is fully identical', async () => {
      const existing = {
        id: 'registry-contact-1',
        tenantId,
        displayName: 'Existing Tenant',
        primaryEmail: 'tenant@example.com',
        primaryPhone: null,
      };
      const contactRepo = makeContactRepo([existing]);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ tenantId }),
      );
      (appointmentRepo as any).deleteContactsByAppointmentId = vi.fn();

      const uc = new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        contactRepo as any,
      );

      await uc.execute({
        appointmentId,
        data: {
          contacts: [
            {
              inline: {
                type: 'RENTAL_TENANT',
                displayName: 'Existing Tenant',
                primaryEmail: 'tenant@example.com',
              },
              role: 'RENTAL_TENANT',
              isPrimary: true,
            },
          ],
        },
        actor: makeActor(),
      });

      expect(contactRepo.findManyActiveByEmailsOrPhones).toHaveBeenCalledWith(
        ['tenant@example.com'],
        [],
      );
      expect(contactRepo.save).not.toHaveBeenCalled();
      expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'registry-contact-1' }),
      );
    });

    it('keeps the payload as an unlinked snapshot when the email collides but the name differs', async () => {
      const existing = {
        id: 'registry-contact-1',
        tenantId,
        displayName: 'Existing Tenant',
        primaryEmail: 'tenant@example.com',
        primaryPhone: null,
      };
      const contactRepo = makeContactRepo([existing]);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ tenantId }),
      );
      (appointmentRepo as any).deleteContactsByAppointmentId = vi.fn();

      const uc = new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        contactRepo as any,
      );

      await uc.execute({
        appointmentId,
        data: {
          contacts: [
            {
              inline: {
                type: 'RENTAL_TENANT',
                displayName: 'Re-typed Tenant',
                primaryEmail: 'tenant@example.com',
              },
              role: 'RENTAL_TENANT',
              isPrimary: true,
            },
          ],
        },
        actor: makeActor(),
      });

      // B-1 regression guarantee holds: no duplicate registry row is created,
      // so the global unique indexes cannot surface as a 500.
      expect(contactRepo.save).not.toHaveBeenCalled();
      expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: null,
          snapshotName: 'Re-typed Tenant',
          snapshotEmail: 'tenant@example.com',
        }),
      );
    });

    it('creates a new registry contact when no active match exists', async () => {
      const contactRepo = makeContactRepo([]);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ tenantId }),
      );
      (appointmentRepo as any).deleteContactsByAppointmentId = vi.fn();

      const uc = new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        contactRepo as any,
      );

      await uc.execute({
        appointmentId,
        data: {
          contacts: [
            {
              inline: {
                type: 'RENTAL_TENANT',
                displayName: 'Brand New',
                primaryEmail: 'brand.new@example.com',
              },
              role: 'RENTAL_TENANT',
              isPrimary: true,
            },
          ],
        },
        actor: makeActor(),
      });

      expect(contactRepo.findManyActiveByEmailsOrPhones).toHaveBeenCalled();
      expect(contactRepo.save).toHaveBeenCalledTimes(1);
      expect(appointmentRepo.saveContact).toHaveBeenCalled();
    });
  });
});
