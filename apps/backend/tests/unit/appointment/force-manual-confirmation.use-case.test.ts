import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForceManualTenantConfirmationUseCase } from '../../../src/modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
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
};

const auditService = {
  log: vi.fn(),
};

function makeUseCase() {
  return new ForceManualTenantConfirmationUseCase(
    appointmentRepo as any,
    auditService as any,
    new AuthorizationService(auditService as any),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.update.mockResolvedValue(undefined);
});

// =============================================================================
// Happy path
// =============================================================================

describe('ForceManualTenantConfirmationUseCase – happy path', () => {
  it('AM can force tenant confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      reason: 'Tenant confirmed verbally',
      actor: makeActor('AM'),
    });
    expect(result.id).toBe('appt-1');
    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });
  });

  it('OP can force tenant confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      reason: 'OP confirms on behalf',
      actor: makeActor('OP'),
    });
    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
  });
});

// =============================================================================
// RBAC enforcement
// =============================================================================

describe('ForceManualTenantConfirmationUseCase – RBAC', () => {
  it.each([
    ['CL_ADMIN' as const],
    ['INSP' as const],
  ])('%s is forbidden', async (role) => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor(role),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('CL_ADMIN forbidden and does not call findById', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor('CL_ADMIN'),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  // H7: CL_USER with force_confirmation permission
  it('CL_USER without force_confirmation permission is forbidden', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor('CL_USER'),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  describe('CL_USER with force_confirmation permission', () => {
    const authzService = new AuthorizationService(auditService as any);

    it('CL_USER with force_confirmation permission can force confirm', async () => {
      appointmentRepo.findById.mockResolvedValue(makeWithRelations());
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, authzService,
      );
      const result = await uc.execute({
        appointmentId: 'appt-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Tenant confirmed by phone',
        actor: makeActor('CL_USER', { clUserPermissions: ['force_confirmation'] }),
      });
      expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    });

    it('CL_USER without force_confirmation permission is forbidden', async () => {
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, authzService,
      );
      await expect(
        uc.execute({
          appointmentId: 'appt-1',
          rentalTenantConfirmationStatus: 'CONFIRMED',
          reason: 'Some reason',
          actor: makeActor('CL_USER', { clUserPermissions: [] }),
        }),
      ).rejects.toThrow('CL_USER does not have force_confirmation permission');
    });
  });
});

// =============================================================================
// Error cases
// =============================================================================

describe('ForceManualTenantConfirmationUseCase – error cases', () => {
  it('throws AppointmentNotFoundError when appointment does not exist', async () => {
    appointmentRepo.findById.mockResolvedValue(null);
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'nonexistent',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });
});

// =============================================================================
// Side effects / audit
// =============================================================================

describe('ForceManualTenantConfirmationUseCase – audit log', () => {
  it('calls audit log with reason and correct before/after', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ rentalTenantConfirmationStatus: 'PENDING' }),
    );
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      reason: 'Tenant called in',
      actor: makeActor('OP', { userId: 'op-user-1' }),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.force_manual_confirmation',
        actorType: 'USER',
        actorId: 'op-user-1',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
        before: { rentalTenantConfirmationStatus: 'PENDING' },
        after: { rentalTenantConfirmationStatus: 'CONFIRMED' },
        reason: 'Tenant called in',
      }),
    );
  });

  it('findById is called with null tenantId (global access)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      reason: 'Test',
      actor: makeActor('AM'),
    });
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  // Hardening pass 2026-04-20: CL_USER must never reach an appointment
  // outside its JWT tenant, even with the `force_confirmation` permission.
  describe('cross-tenant hardening for CL_USER', () => {
    const authzService = new AuthorizationService(auditService as any);

    it('pins the findById tenant scope to the actor tenant for CL_USER', async () => {
      appointmentRepo.findById.mockResolvedValue(makeWithRelations());
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, authzService,
      );

      await uc.execute({
        appointmentId: 'appt-1',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        reason: 'Tenant confirmed by phone',
        actor: makeActor('CL_USER', {
          tenantId: 'tenant-1',
          clUserPermissions: ['force_confirmation'],
        }),
      });

      expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1');
    });

    it('rejects when the loaded appointment belongs to a different tenant', async () => {
      // Repo returns an appointment from another tenant (simulates a stale
      // cache / loosened scope on the repo side). Use case must still refuse.
      appointmentRepo.findById.mockResolvedValue(
        makeWithRelations({ tenantId: 'tenant-other' }),
      );
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, authzService,
      );

      await expect(
        uc.execute({
          appointmentId: 'appt-1',
          rentalTenantConfirmationStatus: 'CONFIRMED',
          reason: 'Cross-tenant attempt',
          actor: makeActor('CL_USER', {
            tenantId: 'tenant-1',
            clUserPermissions: ['force_confirmation'],
          }),
        }),
      ).rejects.toThrow();
      expect(appointmentRepo.update).not.toHaveBeenCalled();
    });
  });
});
