import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/update-inspector.use-case';
import { DeactivateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/deactivate-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { IInspectorAppointmentChecker } from '../../../src/modules/inspector/domain/inspector-appointment-checker';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { InspectorEmailConflictError } from '../../../src/modules/inspector/domain/inspector.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    userId: 'user-insp-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}): UserEntity {
  return new UserEntity({
    id: 'user-other',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_USER',
    name: 'Someone',
    email: 'taken@example.com',
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
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeUserRepo(): IUserManagementRepository {
  return {
    findById: vi.fn(),
    findByIdAndTenantId: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findByTenantId: vi.fn(),
    countByTenantId: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    unlock: vi.fn(),
    revokeAllSessions: vi.fn(),
  };
}

function makeInspectorRepo(): IInspectorRepository {
  return {
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
}

describe('UpdateInspectorUseCase — login account email sync', () => {
  let inspectorRepo: IInspectorRepository;
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let useCase: UpdateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = makeInspectorRepo();
    userManagementRepo = makeUserRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateInspectorUseCase(
      inspectorRepo,
      auditService,
      undefined,
      new AuthorizationService(auditService),
      userManagementRepo,
    );
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
  });

  it('propagates an email change to the linked login account', async () => {
    // Without this, the UI shows the new address while login still expects the
    // old one, and PWA "Forgot password" silently no-ops on the unknown email.
    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { email: 'new@example.com' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ email: 'new@example.com' }),
    );
  });

  it('re-asserts an unchanged email onto the login account rather than skipping', async () => {
    // Idempotent by design: driving the sync off the payload instead of a diff is
    // what lets a retry repair a previously failed users write.
    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { email: 'john@example.com', name: 'Renamed' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ email: 'john@example.com' }),
    );
  });

  it('does not touch the login account when neither email nor status is supplied', async () => {
    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { name: 'Renamed', phone: '+61400000002' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).not.toHaveBeenCalled();
    expect(userManagementRepo.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('no-ops safely when the inspector has no linked login account', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ userId: null }));

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { email: 'new@example.com' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).not.toHaveBeenCalled();
  });

  it('rejects an email already taken by another login account', async () => {
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { email: 'taken@example.com' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorEmailConflictError);

    expect(inspectorRepo.update).not.toHaveBeenCalled();
  });

  it('deactivates the linked login account and revokes sessions on status INACTIVE', async () => {
    // The PATCH route accepts `status` and the web edit drawer sends it, so this
    // path could otherwise deactivate the inspector while leaving a fully usable
    // login — the exact hole the deactivate endpoint closes.
    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { status: 'INACTIVE' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ status: 'INACTIVE' }),
    );
    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith('user-insp-1');
  });

  it('reactivates the linked login account on status ACTIVE', async () => {
    // Without this a reactivated inspector can be assigned work but can never log
    // in: login gates on users.status and no other path restores it.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ status: 'INACTIVE' }));

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { status: 'ACTIVE' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ status: 'ACTIVE' }),
    );
    expect(userManagementRepo.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when the status is resubmitted unchanged', async () => {
    // The drawer resubmits the prefilled status on every save, so a name-only
    // edit must not log the inspector out of the PWA.
    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { status: 'ACTIVE', name: 'Renamed' },
      actor: makeActor(),
    });

    expect(userManagementRepo.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('re-syncs the email on retry after a failed login-account write', async () => {
    // The inspector row already carries the new email, so recomputing "changed"
    // from it would skip the sync forever while returning 200.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ email: 'new@example.com' }),
    );

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { email: 'new@example.com' },
      actor: makeActor(),
    });

    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ email: 'new@example.com' }),
    );
  });

  it('does not 409 a legacy inspector whose stored email differs only in case', async () => {
    // The drawer resubmits the prefilled email on every edit, so a mixed-case
    // legacy row would collide with its own login account on a phone-only change.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ email: 'John@Example.com' }),
    );
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(
      makeUser({ id: 'someone-else', email: 'john@example.com' }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { email: 'john@example.com', phone: '+61400000001' },
        actor: makeActor(),
      }),
    ).resolves.toBeDefined();
  });

  it('ignores a self-match when re-saving the inspector own login account', async () => {
    // findByEmail would return the inspector's OWN user row for an unchanged
    // email; guarding on userId keeps that from reading as a conflict.
    vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(
      makeUser({ id: 'user-insp-1', email: 'new@example.com', role: 'INSP', tenantId: null }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { email: 'new@example.com' },
        actor: makeActor(),
      }),
    ).resolves.toBeDefined();
  });
});

describe('DeactivateInspectorUseCase — login account lockout', () => {
  let inspectorRepo: IInspectorRepository;
  let userManagementRepo: IUserManagementRepository;
  let appointmentChecker: IInspectorAppointmentChecker;
  let auditService: AuditService;
  let useCase: DeactivateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = makeInspectorRepo();
    userManagementRepo = makeUserRepo();
    appointmentChecker = {
      countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({ total: 0, byStatus: {} }),
    } as unknown as IInspectorAppointmentChecker;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new DeactivateInspectorUseCase(
      inspectorRepo,
      appointmentChecker,
      auditService,
      new AuthorizationService(auditService),
      userManagementRepo,
    );
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
  });

  it('revokes sessions and deactivates the linked login account', async () => {
    // A deactivated inspector kept a fully working PWA session before this.
    await useCase.execute({
      inspectorId: 'inspector-1',
      reason: 'Contract ended',
      actor: makeActor(),
    });

    expect(userManagementRepo.revokeAllSessions).toHaveBeenCalledWith('user-insp-1');
    expect(userManagementRepo.update).toHaveBeenCalledWith(
      'user-insp-1',
      null,
      expect.objectContaining({ status: 'INACTIVE' }),
    );
  });

  it('still deactivates an inspector with no linked login account', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ userId: null }));

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      reason: 'Contract ended',
      actor: makeActor(),
    });

    expect(result.status).toBe('INACTIVE');
    expect(userManagementRepo.revokeAllSessions).not.toHaveBeenCalled();
    expect(userManagementRepo.update).not.toHaveBeenCalled();
  });
});
