import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentDoneCheckerInvalidRoleError,
  AppointmentInspectorRequiredError,
  AppointmentTenantConfirmationRequiredError,
  AppointmentServiceGroupRequiredError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import type { AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

// --- Helpers ---

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: null,
    status: 'DRAFT',
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

function makeUserEntity(role: 'AM' | 'OP' | 'CL_ADMIN' | 'CL_USER' | 'INSP'): UserEntity {
  return new UserEntity({
    id: 'checker-1',
    tenantId: null,
    branchId: null,
    role,
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
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

const userRepo = {
  findById: vi.fn(),
  findByIdAndTenantId: vi.fn(),
  findByEmail: vi.fn(),
  findByTenantId: vi.fn(),
  countByTenantId: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  resetPassword: vi.fn(),
  revokeAllSessions: vi.fn(),
};

const auditService = {
  log: vi.fn(),
};

const onDoneHandler = {
  execute: vi.fn().mockResolvedValue(undefined),
};

const onTransitionHandler = {
  execute: vi.fn().mockResolvedValue(undefined),
};

const inspectorRepo = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByUserId: vi.fn(),
  linkUserId: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  findByRegionId: vi.fn(),
};

const idempotencyService = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

const tenantRepo = {
  findById: vi.fn(),
  findByLegalName: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const serviceTypeRepo = {
  findById: vi.fn(),
  findByCode: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

function makeUseCase(opts: { withOnDoneHandler?: boolean; withOnTransitionHandler?: boolean; withTenantRepo?: boolean; withAuthorizationService?: boolean; withServiceTypeRepo?: boolean } = {}) {
  return new ExecuteStatusTransitionUseCase(
    appointmentRepo as any,
    userRepo as any,
    inspectorRepo as any,
    idempotencyService as any,
    auditService as any,
    opts.withOnDoneHandler ? onDoneHandler : undefined,
    opts.withOnTransitionHandler ? onTransitionHandler : undefined,
    opts.withAuthorizationService ? new AuthorizationService() : undefined,
    opts.withServiceTypeRepo ? (serviceTypeRepo as any) : undefined,
  );
}


beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.update.mockResolvedValue(undefined);
  onDoneHandler.execute.mockResolvedValue(undefined);
  onTransitionHandler.execute.mockResolvedValue(undefined);
});

// =============================================================================
// Valid transitions
// =============================================================================

describe('ExecuteStatusTransitionUseCase – valid transitions', () => {
  it('DRAFT → AWAITING_INSPECTOR (OP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT', serviceGroupId: 'sg-1' }));
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'AWAITING_INSPECTOR',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('AWAITING_INSPECTOR');
    expect(result.previousStatus).toBe('DRAFT');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', expect.objectContaining({ status: 'AWAITING_INSPECTOR' }));
  });

  it('DRAFT → REJECTED with reason (AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'REJECTED',
      reason: 'Invalid property',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('Invalid property');
  });

  it('DRAFT → CANCELLED with reason (CL_ADMIN actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'Client request',
      actor: makeActor('CL_ADMIN'),
    });
    expect(result.status).toBe('CANCELLED');
    expect(result.reason).toBe('Client request');
  });

  it('AWAITING_INSPECTOR → SCHEDULED with inspectorId (OP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
    expect(result.inspectorId).toBe('insp-1');
  });

  it('AWAITING_INSPECTOR → CANCELLED with reason (CL_USER actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'No longer needed',
      actor: makeActor('CL_USER'),
    });
    expect(result.status).toBe('CANCELLED');
  });

  it('AWAITING_INSPECTOR → REJECTED with reason (AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'REJECTED',
      reason: 'Duplicate',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('REJECTED');
  });

  it('SCHEDULED → DONE with doneCheckedByUserId (INSP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('OP'));
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });
    expect(result.status).toBe('DONE');
    expect(result.doneCheckedByUserId).toBe('checker-1');
    expect(result.doneCheckedAt).toBeInstanceOf(Date);
  });

  it('SCHEDULED → CANCELLED with reason (AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'Emergency cancellation',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('CANCELLED');
  });

  it('SCHEDULED → REJECTED with reason (OP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'REJECTED',
      reason: 'Property inaccessible',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('REJECTED');
  });

  it('REJECTED → DRAFT with reason (AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'REJECTED', reason: 'old reason' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Reopening for review',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('DRAFT');
    expect(result.previousStatus).toBe('REJECTED');
  });

  it('REJECTED → AWAITING_INSPECTOR with reason (OP actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'REJECTED', serviceGroupId: 'sg-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'AWAITING_INSPECTOR',
      reason: 'Reopening for reassignment',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('AWAITING_INSPECTOR');
  });

  it('CANCELLED → DRAFT with reason (AM actor)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'CANCELLED', reason: 'cancelled before' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Restoring appointment',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('DRAFT');
  });

  it('DONE → DRAFT with reason (AM only)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({
        status: 'DONE',
        doneCheckedByUserId: 'checker-1',
        doneCheckedAt: new Date(),
      }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Incorrect execution',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('DRAFT');
    expect(result.doneCheckedByUserId).toBeNull();
    expect(result.doneCheckedAt).toBeNull();
  });

  it('DONE → REJECTED with reason (AM only)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'DONE', doneCheckedByUserId: 'checker-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'REJECTED',
      reason: 'Fraud detected',
      actor: makeActor('AM'),
    });
    expect(result.status).toBe('REJECTED');
  });
});

// =============================================================================
// Error cases
// =============================================================================

describe('ExecuteStatusTransitionUseCase – error cases', () => {
  it('throws AppointmentNotFoundError when appointment is not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'missing',
        targetStatus: 'AWAITING_INSPECTOR',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('throws AppointmentInvalidTransitionError for DRAFT → DONE', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentInvalidTransitionError);
  });

  it('throws AppointmentTransitionNotPermittedError when CL_USER tries DRAFT → AWAITING_INSPECTOR', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'AWAITING_INSPECTOR',
        actor: makeActor('CL_USER'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });

  it('throws AppointmentServiceGroupRequiredError when DRAFT → AWAITING_INSPECTOR with no serviceGroupId', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT', serviceGroupId: null }));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'AWAITING_INSPECTOR',
        actor: makeActor('OP'),
      }),
    ).rejects.toThrow(AppointmentServiceGroupRequiredError);
  });

  it('throws AppointmentReasonRequiredError when reason is missing for DRAFT → CANCELLED', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'CANCELLED',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentReasonRequiredError);
  });

  it('allows SCHEDULED → DONE without doneCheckedByUserId (INSP finishing inspection)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });
    expect(result.status).toBe('DONE');
    expect(result.doneCheckedByUserId).toBeNull();
    expect(result.doneCheckedAt).toBeNull();
  });

  it('throws AppointmentDoneCheckerInvalidRoleError when checker is CL_USER', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('CL_USER'));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        doneCheckedByUserId: 'checker-1',
        actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
      }),
    ).rejects.toThrow(AppointmentDoneCheckerInvalidRoleError);
  });

  it('throws AppointmentDoneCheckerInvalidRoleError when checker is not found', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(null);
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        doneCheckedByUserId: 'nonexistent',
        actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
      }),
    ).rejects.toThrow(AppointmentDoneCheckerInvalidRoleError);
  });

  it('throws AppointmentInspectorRequiredError when inspectorId missing for SCHEDULED transition', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'SCHEDULED',
        actor: makeActor('OP'),
      }),
    ).rejects.toThrow(AppointmentInspectorRequiredError);
  });

  it('throws AppointmentAccessDeniedError when INSP is not assigned to the appointment', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'other-insp' }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        doneCheckedByUserId: 'checker-1',
        actor: makeActor('INSP', { userId: 'different-insp', tenantId: 'tenant-1', inspectorId: 'different-insp' }),
      }),
    ).rejects.toThrow(AppointmentAccessDeniedError);
  });

  it('throws AppointmentTransitionNotPermittedError when OP tries DONE → DRAFT', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'DONE' }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DRAFT',
        reason: 'Some reason',
        actor: makeActor('OP'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });
});

// =============================================================================
// Side effect tests
// =============================================================================

describe('ExecuteStatusTransitionUseCase – side effects', () => {
  it('stores reason when transition requires it', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'Agency request',
      actor: makeActor('AM'),
    });
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ reason: 'Agency request' }),
    );
  });

  it('clears reason when reopening to DRAFT (REJECTED → DRAFT requires reason but update sets it; CANCELLED → DRAFT sets reason)', async () => {
    // CANCELLED → DRAFT: requiresReason = true, so reason is set (not cleared)
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'CANCELLED', reason: 'old reason' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Restoring',
      actor: makeActor('AM'),
    });
    expect(result.reason).toBe('Restoring');
  });

  it('clears reason when AWAITING_INSPECTOR → SCHEDULED (no requiresReason, no DRAFT)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    // No reason was set, fallback to appointment.reason which is null
    expect(result.reason).toBeNull();
  });

  it('sets reason on REJECTED → AWAITING_INSPECTOR (requiresReason is true)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'REJECTED', reason: 'previous reason', inspectorId: 'insp-1', serviceGroupId: 'sg-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'AWAITING_INSPECTOR',
      reason: 'Reopening for reassignment',
      actor: makeActor('OP'),
    });
    expect(result.reason).toBe('Reopening for reassignment');
  });

  it('clears reason on DRAFT → AWAITING_INSPECTOR (no requiresReason, targetStatus is not DRAFT)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'DRAFT', reason: null, serviceGroupId: 'sg-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'AWAITING_INSPECTOR',
      actor: makeActor('OP'),
    });
    expect(result.reason).toBeNull();
  });

  it('sets inspectorId on SCHEDULED transition', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-99',
      actor: makeActor('OP'),
    });
    expect(result.inspectorId).toBe('insp-99');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ inspectorId: 'insp-99' }),
    );
  });

  it('sets doneCheckedByUserId and doneCheckedAt on DONE transition', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('AM'));
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });
    expect(result.doneCheckedByUserId).toBe('checker-1');
    expect(result.doneCheckedAt).toBeInstanceOf(Date);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        doneCheckedByUserId: 'checker-1',
        doneCheckedAt: expect.any(Date),
      }),
    );
  });

  it('clears doneCheckedByUserId and doneCheckedAt on DONE → DRAFT reopen', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({
        status: 'DONE',
        doneCheckedByUserId: 'checker-1',
        doneCheckedAt: new Date('2026-01-01'),
      }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Reopening',
      actor: makeActor('AM'),
    });
    expect(result.doneCheckedByUserId).toBeNull();
    expect(result.doneCheckedAt).toBeNull();
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        doneCheckedByUserId: null,
        doneCheckedAt: null,
      }),
    );
  });

  it('calls audit log with correct from/to status', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT', serviceGroupId: 'sg-1' }));
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'AWAITING_INSPECTOR',
      actor: makeActor('OP', { userId: 'user-op' }),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.status_transition',
        actorType: 'USER',
        actorId: 'user-op',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
        before: { status: 'DRAFT' },
        after: { status: 'AWAITING_INSPECTOR' },
      }),
    );
  });

  it('does not require inspectorId when appointment already has an inspector', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: 'existing-insp' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
    expect(result.inspectorId).toBe('existing-insp');
  });
});

// =============================================================================
// DONE side effects (onDoneHandler)
// =============================================================================

describe('ExecuteStatusTransitionUseCase – DONE side effects', () => {
  it('calls onDoneHandler.execute when transitioning to DONE with cross-check', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('OP'));
    const uc = makeUseCase({ withOnDoneHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    expect(onDoneHandler.execute).toHaveBeenCalledOnce();
    expect(onDoneHandler.execute).toHaveBeenCalledWith({ appointmentId: 'appt-1' });
  });

  it('does NOT call onDoneHandler when INSP marks DONE without cross-check', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    const uc = makeUseCase({ withOnDoneHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    expect(onDoneHandler.execute).not.toHaveBeenCalled();
  });

  it('succeeds without onDoneHandler (backward compatibility)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    expect(result.status).toBe('DONE');
    expect(onDoneHandler.execute).not.toHaveBeenCalled();
  });

  it('transition still succeeds if onDoneHandler throws', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('OP'));
    onDoneHandler.execute.mockRejectedValueOnce(new Error('Financial entry creation failed'));

    const uc = makeUseCase({ withOnDoneHandler: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    expect(result.status).toBe('DONE');
    expect(onDoneHandler.execute).toHaveBeenCalledOnce();
  });

  it('does NOT call onDoneHandler for non-DONE transitions', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase({ withOnDoneHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });

    expect(onDoneHandler.execute).not.toHaveBeenCalled();
  });

  it('does NOT call onDoneHandler when reopening FROM DONE to DRAFT', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({
        status: 'DONE',
        doneCheckedByUserId: 'checker-1',
        doneCheckedAt: new Date(),
      }),
    );
    const uc = makeUseCase({ withOnDoneHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DRAFT',
      reason: 'Reopening',
      actor: makeActor('AM'),
    });

    expect(onDoneHandler.execute).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Transition side effects (onTransitionHandler)
// =============================================================================

describe('ExecuteStatusTransitionUseCase – onTransitionHandler', () => {
  it('calls onTransitionHandler with correct args when transitioning to SCHEDULED', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase({ withOnTransitionHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });

    expect(onTransitionHandler.execute).toHaveBeenCalledOnce();
    expect(onTransitionHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });
  });

  it('calls onTransitionHandler with correct args when transitioning to CANCELLED', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase({ withOnTransitionHandler: true });
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'Client request',
      actor: makeActor('AM'),
    });

    expect(onTransitionHandler.execute).toHaveBeenCalledOnce();
    expect(onTransitionHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });
  });

  it('transition succeeds if onTransitionHandler throws', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    onTransitionHandler.execute.mockRejectedValueOnce(new Error('Notification failure'));

    const uc = makeUseCase({ withOnTransitionHandler: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });

    expect(result.status).toBe('SCHEDULED');
    expect(onTransitionHandler.execute).toHaveBeenCalledOnce();
  });

  it('does not call onTransitionHandler when not provided', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null }),
    );
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });

    expect(onTransitionHandler.execute).not.toHaveBeenCalled();
  });
});

// =============================================================================
// CL_USER permission checks (H5)
// =============================================================================

describe('ExecuteStatusTransitionUseCase – CL_USER cancel permission', () => {
  it('allows CL_USER to cancel when cancel_appointments permission is granted', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );
    const uc = makeUseCase({ withAuthorizationService: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'No longer needed',
      actor: makeActor('CL_USER', { clUserPermissions: ['cancel_appointments'] }),
    });
    expect(result.status).toBe('CANCELLED');
  });

  it('throws ForbiddenError when CL_USER lacks cancel_appointments permission', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );
    const uc = makeUseCase({ withAuthorizationService: true });
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'CANCELLED',
        reason: 'No longer needed',
        actor: makeActor('CL_USER', { clUserPermissions: [] }),
      }),
    ).rejects.toThrow('CL_USER does not have cancel_appointments permission');
  });

  // M1: DONE → REJECTED financial audit
  it('emits audit log with requiresFinancialReview on DONE → REJECTED', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'DONE', doneCheckedByUserId: 'checker-1' }),
    );
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'REJECTED',
      reason: 'Fraud detected',
      actor: makeActor('AM'),
    });
    // Two audit calls: one for status_transition, one for done_rejected
    const donRejectedCall = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'appointment.done_rejected',
    );
    expect(donRejectedCall).toBeDefined();
    expect(donRejectedCall[0].metadata).toEqual({ requiresFinancialReview: true });
  });

  it('allows CL_ADMIN to cancel without permission check', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'DRAFT' }),
    );
    const uc = makeUseCase({ withTenantRepo: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'CANCELLED',
      reason: 'Client request',
      actor: makeActor('CL_ADMIN'),
    });
    expect(result.status).toBe('CANCELLED');
    expect(tenantRepo.findById).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AM restricted transitions (H1)
// =============================================================================

describe('ExecuteStatusTransitionUseCase – AM restricted from operational transitions', () => {
  it('throws AppointmentTransitionNotPermittedError when AM tries DRAFT → AWAITING_INSPECTOR', async () => {
    appointmentRepo.findById.mockResolvedValue(makeWithRelations({ status: 'DRAFT' }));
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'AWAITING_INSPECTOR',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });

  it('throws AppointmentTransitionNotPermittedError when AM tries AWAITING_INSPECTOR → SCHEDULED', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'SCHEDULED',
        inspectorId: 'insp-1',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });

  it('throws AppointmentTransitionNotPermittedError when AM tries SCHEDULED → DONE', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        doneCheckedByUserId: 'checker-1',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });

  it('throws AppointmentTransitionNotPermittedError when AM tries SCHEDULED → REJECTED', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    const uc = makeUseCase();
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'REJECTED',
        reason: 'Some reason',
        actor: makeActor('AM'),
      }),
    ).rejects.toThrow(AppointmentTransitionNotPermittedError);
  });
});

// =============================================================================
// M1: INSP DONE pending cross-check audit
// =============================================================================

describe('ExecuteStatusTransitionUseCase – INSP DONE pending cross-check', () => {
  it('emits audit log with pendingOperatorCrossCheck when INSP marks DONE without checker', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    const pendingCall = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'appointment.done_pending_crosscheck',
    );
    expect(pendingCall).toBeDefined();
    expect(pendingCall[0].metadata).toEqual({ pendingOperatorCrossCheck: true });
  });

  it('does not emit pending cross-check audit when INSP provides doneCheckedByUserId', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'actor-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('OP'));
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('INSP', { userId: 'actor-1', tenantId: 'tenant-1', inspectorId: 'actor-1' }),
    });

    const pendingCall = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'appointment.done_pending_crosscheck',
    );
    expect(pendingCall).toBeUndefined();
  });

  it('does not emit pending cross-check audit when OP marks DONE', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'SCHEDULED', inspectorId: 'insp-1' }),
    );
    userRepo.findById.mockResolvedValue(makeUserEntity('OP'));
    const uc = makeUseCase();
    await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      doneCheckedByUserId: 'checker-1',
      actor: makeActor('OP'),
    });

    const pendingCall = (auditService.log as any).mock.calls.find(
      (c: any[]) => c[0].action === 'appointment.done_pending_crosscheck',
    );
    expect(pendingCall).toBeUndefined();
  });
});

// =============================================================================
// M3: Service type confirmation rules
// =============================================================================

describe('ExecuteStatusTransitionUseCase – service type confirmation rules', () => {
  it('throws AppointmentTenantConfirmationRequiredError for ROUTINE inspection without confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null, tenantConfirmationStatus: 'PENDING' }),
    );
    serviceTypeRepo.findById.mockResolvedValue({
      id: 'st-1',
      code: 'ROUTINE_INSP',
      name: 'Routine Inspection',
      flowType: 'ROUTINE',
      requiresTenantConfirmation: true,
      status: 'ACTIVE',
    });
    const uc = makeUseCase({ withServiceTypeRepo: true });
    await expect(
      uc.execute({
        appointmentId: 'appt-1',
        targetStatus: 'SCHEDULED',
        inspectorId: 'insp-1',
        actor: makeActor('OP'),
      }),
    ).rejects.toThrow(AppointmentTenantConfirmationRequiredError);
  });

  it('allows ROUTINE inspection to proceed when tenant is confirmed', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null, tenantConfirmationStatus: 'CONFIRMED' }),
    );
    serviceTypeRepo.findById.mockResolvedValue({
      id: 'st-1',
      code: 'ROUTINE_INSP',
      name: 'Routine Inspection',
      flowType: 'ROUTINE',
      requiresTenantConfirmation: true,
      status: 'ACTIVE',
    });
    const uc = makeUseCase({ withServiceTypeRepo: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
  });

  it('allows INGOING inspection without tenant confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null, tenantConfirmationStatus: 'PENDING' }),
    );
    serviceTypeRepo.findById.mockResolvedValue({
      id: 'st-2',
      code: 'INGOING_INSP',
      name: 'Ingoing Inspection',
      flowType: 'INGOING',
      requiresTenantConfirmation: false,
      status: 'ACTIVE',
    });
    const uc = makeUseCase({ withServiceTypeRepo: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
  });

  it('allows OUTGOING inspection without tenant confirmation', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null, tenantConfirmationStatus: 'PENDING' }),
    );
    serviceTypeRepo.findById.mockResolvedValue({
      id: 'st-3',
      code: 'OUTGOING_INSP',
      name: 'Outgoing Inspection',
      flowType: 'OUTGOING',
      requiresTenantConfirmation: false,
      status: 'ACTIVE',
    });
    const uc = makeUseCase({ withServiceTypeRepo: true });
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
  });

  it('allows scheduling without service type repo (backward compatibility)', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeWithRelations({ status: 'AWAITING_INSPECTOR', inspectorId: null, tenantConfirmationStatus: 'PENDING' }),
    );
    const uc = makeUseCase();
    const result = await uc.execute({
      appointmentId: 'appt-1',
      targetStatus: 'SCHEDULED',
      inspectorId: 'insp-1',
      actor: makeActor('OP'),
    });
    expect(result.status).toBe('SCHEDULED');
  });
});
