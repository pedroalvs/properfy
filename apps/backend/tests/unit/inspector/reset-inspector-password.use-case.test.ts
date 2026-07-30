import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetInspectorPasswordUseCase } from '../../../src/modules/inspector/application/use-cases/reset-inspector-password.use-case';
import type { ResetUserPasswordUseCase } from '../../../src/modules/user/application/use-cases/reset-user-password.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import {
  InspectorNotFoundError,
  InspectorNoLoginAccountError,
  InspectorInactiveError,
} from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const NEW_PASSWORD = 'Insp@2026x';

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

describe('ResetInspectorPasswordUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let resetUserPasswordUseCase: ResetUserPasswordUseCase;
  let auditService: AuditService;
  let useCase: ResetInspectorPasswordUseCase;

  beforeEach(() => {
    inspectorRepo = {
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
    resetUserPasswordUseCase = { execute: vi.fn() } as unknown as ResetUserPasswordUseCase;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ResetInspectorPasswordUseCase(
      inspectorRepo,
      resetUserPasswordUseCase,
      auditService,
      new AuthorizationService(auditService),
    );
  });

  it('delegates to ResetUserPasswordUseCase with a null tenant', async () => {
    // Inspector login accounts are cross-tenant (tenant_id IS NULL), which is the
    // row shape findByIdAndTenantId(userId, null) resolves.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    await useCase.execute({
      inspectorId: 'inspector-1',
      newPassword: NEW_PASSWORD,
      actor: makeActor(),
    });

    expect(resetUserPasswordUseCase.execute).toHaveBeenCalledWith({
      tenantId: null,
      userId: 'user-insp-1',
      newPassword: NEW_PASSWORD,
      actor: expect.objectContaining({ role: 'AM' }),
    });
  });

  it('emits an inspector-scoped audit record alongside the delegate', async () => {
    // The delegate audits entityType 'User' against the INSP user id, which no
    // API exposes — without this row an auditor holding an inspector id has no
    // path to the reset.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    await useCase.execute({
      inspectorId: 'inspector-1',
      newPassword: NEW_PASSWORD,
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.password_reset',
        entityType: 'Inspector',
        entityId: 'inspector-1',
        metadata: expect.objectContaining({ userId: 'user-insp-1', resetByRole: 'AM' }),
      }),
    );
  });

  it('allows OP', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    await useCase.execute({
      inspectorId: 'inspector-1',
      newPassword: NEW_PASSWORD,
      actor: makeActor({ role: 'OP' }),
    });

    expect(resetUserPasswordUseCase.execute).toHaveBeenCalled();
  });

  it('rejects CL_ADMIN before looking the inspector up', async () => {
    // Checking the role first keeps 404-vs-403 from leaking whether a given
    // inspector id exists to tenant-scoped callers.
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        newPassword: NEW_PASSWORD,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(inspectorRepo.findById).not.toHaveBeenCalled();
    expect(resetUserPasswordUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects INSP trying to reset a password', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        newPassword: NEW_PASSWORD,
        actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws INSPECTOR_NOT_FOUND for an unknown inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'missing',
        newPassword: NEW_PASSWORD,
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);

    expect(resetUserPasswordUseCase.execute).not.toHaveBeenCalled();
  });

  it('throws INSPECTOR_NO_LOGIN_ACCOUNT when the inspector has no linked user', async () => {
    // inspectors.user_id is nullable with no backfill and its FK is ON DELETE
    // SET NULL, so legacy rows genuinely reach this branch.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ userId: null }));

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        newPassword: NEW_PASSWORD,
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNoLoginAccountError);

    expect(resetUserPasswordUseCase.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.password_reset' }),
    );
  });

  it('refuses to reset a deactivated inspector', async () => {
    // resetPassword unconditionally sets users.status = ACTIVE (it doubles as
    // the unlock path), so staging credentials for a terminated inspector would
    // silently hand their PWA access back while inspectors.status reads INACTIVE.
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ status: 'INACTIVE' }));

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        newPassword: NEW_PASSWORD,
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorInactiveError);

    expect(resetUserPasswordUseCase.execute).not.toHaveBeenCalled();
  });

  it('does not audit when the delegate rejects', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(resetUserPasswordUseCase.execute).mockRejectedValue(new Error('too weak'));

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        newPassword: 'weak',
        actor: makeActor(),
      }),
    ).rejects.toThrow('too weak');

    expect(auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.password_reset' }),
    );
  });
});
