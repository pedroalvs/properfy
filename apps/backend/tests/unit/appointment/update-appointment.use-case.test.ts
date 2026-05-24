import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import {
  AppointmentNotFoundError,
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
  AppointmentDateInPastError,
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
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
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
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = false,
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: withContact ? makeContact() : null,
    restrictions: [],
  };
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

  it('should fail to update a SCHEDULED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
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
          tenantName: 'Jane Doe',
          primaryEmail: 'jane@example.com',
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.updateContact).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({ tenantName: 'Jane Doe' }),
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
          tenantName: 'New Contact',
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
      // Freeze time before the existing appointment's time slot (09:00) so
      // the slot-in-past check does not fire when rescheduling to today.
      vi.useFakeTimers({ now: new Date('2026-06-15T07:00:00Z') });
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const today = '2026-06-15'; // matches frozen date
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

    function makeContactRepo(existing: unknown) {
      return {
        findById: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        search: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        existsByEmail: vi.fn(),
        existsByPhone: vi.fn(),
        findActiveByEmailOrPhone: vi.fn().mockResolvedValue(existing),
        findAppointmentsByContactId: vi.fn(),
        countAppointmentsByContactId: vi.fn(),
      };
    }

    it('reuses an existing active contact when inline email/phone collide', async () => {
      const existing = {
        id: 'registry-contact-1',
        tenantId,
        displayName: 'Existing Tenant',
        primaryEmail: 'tenant@example.com',
        primaryPhone: null,
      };
      const contactRepo = makeContactRepo(existing);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ tenantId }),
      );
      (appointmentRepo as any).deleteContactsByAppointmentId = vi.fn();

      const uc = new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        contactRepo as any,
      );

      await uc.execute({
        appointmentId,
        data: {
          contacts: [
            {
              inline: {
                type: 'TENANT',
                displayName: 'Re-typed Tenant',
                primaryEmail: 'tenant@example.com',
              },
              role: 'TENANT',
              isPrimary: true,
            },
          ],
        },
        actor: makeActor(),
      });

      expect(contactRepo.findActiveByEmailOrPhone).toHaveBeenCalledWith(
        tenantId,
        'tenant@example.com',
        null,
      );
      expect(contactRepo.save).not.toHaveBeenCalled();
      expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'registry-contact-1' }),
      );
    });

    it('creates a new registry contact when no active match exists', async () => {
      const contactRepo = makeContactRepo(null);
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ tenantId }),
      );
      (appointmentRepo as any).deleteContactsByAppointmentId = vi.fn();

      const uc = new UpdateAppointmentUseCase(
        appointmentRepo,
        auditService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        contactRepo as any,
      );

      await uc.execute({
        appointmentId,
        data: {
          contacts: [
            {
              inline: {
                type: 'TENANT',
                displayName: 'Brand New',
                primaryEmail: 'brand.new@example.com',
              },
              role: 'TENANT',
              isPrimary: true,
            },
          ],
        },
        actor: makeActor(),
      });

      expect(contactRepo.findActiveByEmailOrPhone).toHaveBeenCalled();
      expect(contactRepo.save).toHaveBeenCalledTimes(1);
      expect(appointmentRepo.saveContact).toHaveBeenCalled();
    });
  });
});
