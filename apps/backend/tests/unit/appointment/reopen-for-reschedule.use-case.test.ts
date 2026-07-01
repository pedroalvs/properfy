import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReopenForRescheduleUseCase,
  AppointmentNotScheduledError,
} from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';

// --- Helpers ---

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: 'insp-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-10'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 200,
    payoutAmount: 140,
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

function makeWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentWithRelations {
  return {
    appointment: makeAppointment(overrides),
    contact: null,
    restrictions: [],
  };
}

function makeActor(role: AuthContext['role'], overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    tenantId: role === 'AM' || role === 'OP' ? null : 'tenant-1',
    role,
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

// --- Mocks ---

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
  findScheduledOnDate: vi.fn(),
  findAllContacts: vi.fn(),
  countContacts: vi.fn(),
  findContactById: vi.fn(),
  findDuplicateForImport: vi.fn(),
};

const auditService = {
  log: vi.fn(),
};

// --- Tests ---

describe('ReopenForRescheduleUseCase', () => {
  let useCase: ReopenForRescheduleUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const authorizationService = new AuthorizationService(auditService as any);
    useCase = new ReopenForRescheduleUseCase(appointmentRepo, auditService, authorizationService);
  });

  it('should reopen a SCHEDULED appointment for reschedule (happy path, AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('AM'),
    });

    expect(result.id).toBe('appt-1');
    expect(result.previousStatus).toBe('SCHEDULED');
    expect(result.status).toBe('DRAFT');
    expect(result.previousScheduledDate).toBe('2026-04-10');
    expect(result.scheduledDate).toBe('2027-06-15');
    expect(result.previousTimeSlotStart).toBe('09:00');
    expect(result.previousTimeSlotEnd).toBe('12:00');
    expect(result.timeSlotStart).toBe('13:00');
    expect(result.timeSlotEnd).toBe('16:00');
    expect(result.previousInspectorId).toBe('insp-1');
    expect(result.inspectorId).toBeNull();
    expect(result.rentalTenantConfirmationStatus).toBe('PENDING');

    // Verify repository update call
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      status: 'DRAFT',
      scheduledDate: new Date('2027-06-15'),
      timeSlotStart: '13:00', timeSlotEnd: '16:00',
      inspectorId: null,
      rentalTenantConfirmationStatus: 'PENDING',
      reason: null,
    });
  });

  it('should reopen a SCHEDULED appointment for reschedule (SYS actor from tenant portal)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-20',
      newTimeSlotStart: '08:00', newTimeSlotEnd: '11:00',
      actor: makeActor('SYS' as AuthContext['role']),
    });

    expect(result.status).toBe('DRAFT');
    expect(result.scheduledDate).toBe('2027-06-20');
  });

  it('should reopen a SCHEDULED appointment for reschedule (OP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-18',
      newTimeSlotStart: '10:00', newTimeSlotEnd: '13:00',
      actor: makeActor('OP'),
    });

    expect(result.status).toBe('DRAFT');
  });

  it('should write an audit log entry with correct before/after snapshots', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      reason: 'Tenant requested new date',
      actor: makeActor('AM'),
    });

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'appointment.rescheduled',
      actorType: 'USER',
      actorId: 'actor-1',
      entityType: 'Appointment',
      entityId: 'appt-1',
      tenantId: 'tenant-1',
      before: {
        status: 'SCHEDULED',
        scheduledDate: '2026-04-10',
        timeSlotStart: '09:00', timeSlotEnd: '12:00',
        inspectorId: 'insp-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      after: {
        status: 'DRAFT',
        scheduledDate: '2027-06-15',
        timeSlotStart: '13:00', timeSlotEnd: '16:00',
        inspectorId: null,
        rentalTenantConfirmationStatus: 'PENDING',
      },
      reason: 'Tenant requested new date',
      metadata: {
        previousInspectorId: 'insp-1',
        initiatedBy: 'AM',
      },
    });
  });

  it('should set actorType to SYSTEM when actor role is SYS', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('SYS' as AuthContext['role']),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'SYSTEM',
        metadata: expect.objectContaining({ initiatedBy: 'SYS' }),
      }),
    );
  });

  it('should use default reason when none provided', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('AM'),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Reopened for reschedule',
      }),
    );
  });

  it('should reject non-SCHEDULED appointments', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotScheduledError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should reject AWAITING_INSPECTOR appointments', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotScheduledError);
  });

  it('should reject DONE appointments', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DONE' }));

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotScheduledError);
  });

  it('should reject CANCELLED appointments', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'CANCELLED' }));

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotScheduledError);
  });

  it('should throw AppointmentNotFoundError when appointment does not exist', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'nonexistent',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  // F1 Revisor cycle 11: CL_ADMIN is now allowed to reopen for reschedule.
  it('should allow CL_ADMIN actor', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeWithRelations());
    vi.mocked(appointmentRepo.update).mockResolvedValue(undefined as any);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('CL_ADMIN', { tenantId: 'tenant-1' }),
    });

    expect(result.status).toBe('DRAFT');
  });

  // Revisor cycle 2/2: CL_ADMIN holding a foreign tenant's appointment id
  // must not be able to reopen it. The repository receives the actor's
  // tenantId as scope, and defense-in-depth rejects any mismatch even if
  // the repo were ever to return data outside scope.
  it('should reject CL_ADMIN when appointment belongs to another tenant', async () => {
    // findById receives actor.tenantId for tenant-scoped roles; the repo
    // returns null (tenant mismatch) — use case throws not-found.
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-foreign',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('CL_ADMIN', { tenantId: 'tenant-attacker' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-foreign', 'tenant-attacker');
  });

  // Defense-in-depth: even if a future repo bug returned an out-of-tenant
  // appointment for a CL_ADMIN, the explicit ownership check rejects it.
  it('should reject CL_ADMIN via defense-in-depth when repo returns mismatched tenant', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeWithRelations({ tenantId: 'tenant-victim' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-victim',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('CL_ADMIN', { tenantId: 'tenant-attacker' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  // AM and OP must keep cross-tenant access (Constitution v1.3.0): the
  // repository is called with `null` so platform staff can act on any
  // appointment regardless of tenant.
  it('should call findById with null scope for AM actor (cross-tenant preserved)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeWithRelations());
    vi.mocked(appointmentRepo.update).mockResolvedValue(undefined as any);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('AM'),
    });

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should call findById with null scope for OP actor (cross-tenant preserved)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeWithRelations());
    vi.mocked(appointmentRepo.update).mockResolvedValue(undefined as any);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('OP'),
    });

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should reject CL_USER actor', async () => {
    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('CL_USER'),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP actor', async () => {
    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        newScheduledDate: '2027-06-15',
        newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
        actor: makeActor('INSP'),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should handle appointment with no inspector assigned', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ inspectorId: null }),
    );
    appointmentRepo.update.mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('AM'),
    });

    expect(result.previousInspectorId).toBeNull();
    expect(result.inspectorId).toBeNull();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ previousInspectorId: null }),
      }),
    );
  });
});

// 026 §FR-543 — additive constructor dep. The previous suite preserves
// backward compatibility (no `tokenRepo` injected → no revoke path).
// This suite pins the new path: when the repo IS injected, the use case
// revokes active portal tokens AFTER the reschedule and emits a
// `rental_tenant_portal.tokens_revoked` audit event.
describe('ReopenForRescheduleUseCase — token revoke (026 §FR-543)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls tokenRepo.revokeAllForAppointment after a successful reschedule', async () => {
    const tokenRepo = {
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      // Other methods aren't called by this code path; cast through unknown.
    } as unknown as ConstructorParameters<typeof ReopenForRescheduleUseCase>[3];
    const authorizationService = new AuthorizationService(auditService as any);
    const useCase = new ReopenForRescheduleUseCase(
      appointmentRepo as any,
      auditService as any,
      authorizationService,
      tokenRepo,
    );
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('OP'),
    });

    expect((tokenRepo as any).revokeAllForAppointment).toHaveBeenCalledTimes(1);
    expect((tokenRepo as any).revokeAllForAppointment).toHaveBeenCalledWith('appt-1');
    // Plus the audit event for the revoke step (separate from the reopen audit).
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rental_tenant_portal.tokens_revoked',
        entityId: 'appt-1',
        metadata: expect.objectContaining({ reason: 'operator_reschedule' }),
      }),
    );
  });

  it('skips the revoke path entirely when tokenRepo is not injected (backward compat)', async () => {
    const authorizationService = new AuthorizationService(auditService as any);
    const useCase = new ReopenForRescheduleUseCase(
      appointmentRepo as any,
      auditService as any,
      authorizationService,
      // tokenRepo omitted
    );
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    appointmentRepo.update.mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      newScheduledDate: '2027-06-15',
      newTimeSlotStart: '13:00', newTimeSlotEnd: '16:00',
      actor: makeActor('OP'),
    });

    // No `rental_tenant_portal.tokens_revoked` audit emitted.
    const revokeCalls = (auditService.log as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([entry]) => (entry as { action: string }).action === 'rental_tenant_portal.tokens_revoked',
    );
    expect(revokeCalls).toHaveLength(0);
  });
});
