import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForceManualTenantConfirmationUseCase } from '../../../src/modules/appointment/application/use-cases/force-manual-confirmation.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
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
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
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
      tenantConfirmationStatus: 'CONFIRMED',
      reason: 'Tenant confirmed verbally',
      actor: makeActor('AM'),
    });
    expect(result.id).toBe('appt-1');
    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'CONFIRMED',
    });
  });

  it('OP can force tenant confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      tenantConfirmationStatus: 'CONFIRMED',
      reason: 'OP confirms on behalf',
      actor: makeActor('OP'),
    });
    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
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
        tenantConfirmationStatus: 'CONFIRMED',
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
        tenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor('CL_ADMIN'),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  // H7: CL_USER with force_confirmation permission
  it('CL_USER without tenantRepo is forbidden', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        tenantConfirmationStatus: 'CONFIRMED',
        reason: 'Some reason',
        actor: makeActor('CL_USER'),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  describe('CL_USER with force_confirmation permission', () => {
    const tenantRepoMock = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    it('CL_USER with force_confirmation permission can force confirm', async () => {
      appointmentRepo.findById.mockResolvedValue(makeWithRelations());
      tenantRepoMock.findById.mockResolvedValue({
        settingsJson: { clUserPermissions: ['force_confirmation'] },
      });
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, tenantRepoMock as any,
      );
      const result = await uc.execute({
        appointmentId: 'appt-1',
        tenantConfirmationStatus: 'CONFIRMED',
        reason: 'Tenant confirmed by phone',
        actor: makeActor('CL_USER'),
      });
      expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    });

    it('CL_USER without force_confirmation permission is forbidden', async () => {
      tenantRepoMock.findById.mockResolvedValue({
        settingsJson: { clUserPermissions: [] },
      });
      const uc = new ForceManualTenantConfirmationUseCase(
        appointmentRepo as any, auditService as any, tenantRepoMock as any,
      );
      await expect(
        uc.execute({
          appointmentId: 'appt-1',
          tenantConfirmationStatus: 'CONFIRMED',
          reason: 'Some reason',
          actor: makeActor('CL_USER'),
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
        tenantConfirmationStatus: 'CONFIRMED',
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
      makeWithRelations({ tenantConfirmationStatus: 'PENDING' }),
    );
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      tenantConfirmationStatus: 'CONFIRMED',
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
        before: { tenantConfirmationStatus: 'PENDING' },
        after: { tenantConfirmationStatus: 'CONFIRMED' },
        reason: 'Tenant called in',
      }),
    );
  });

  it('findById is called with null tenantId (global access)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations());
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      tenantConfirmationStatus: 'CONFIRMED',
      reason: 'Test',
      actor: makeActor('AM'),
    });
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });
});
