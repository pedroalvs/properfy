import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/update-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import {
  InspectorNotFoundError,
  InspectorEmailConflictError,
} from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'service-1', certified: false }],
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

describe('UpdateInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let useCase: UpdateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpdateInspectorUseCase(inspectorRepo, auditService, undefined, authorizationService);
  });

  it('should update inspector for AM', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      data: { name: 'Updated Name' },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Name');
    expect(inspectorRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.updated' }),
    );
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { name: 'Test' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw INSPECTOR_NOT_FOUND when not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        data: { name: 'Test' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  // Regression: PATCH must persist `blockedClients` and profile fields. Before
  // this fix the use case silently dropped them, which made it impossible to
  // clear an inspector's blocked-tenant list via the UI and caused the
  // INSPECTOR_INELIGIBLE failure in the marketplace accept flow.
  it('persists blockedClients and profile fields on update', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector({ blockedClientsJson: ['tenant-X'] }));

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: {
        blockedClients: [],
        fullName: 'Mike Inspector',
        abn: '12345678901',
        dateOfBirth: '1990-01-15',
        insuranceFileKey: 'ins-key-1',
        insuranceExpiresAt: '2027-01-01',
        policeCheckFileKey: 'pc-key-1',
        policeCheckExpiresAt: '2027-06-01',
      },
      actor: makeActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(
      'inspector-1',
      expect.objectContaining({
        blockedClientsJson: [],
        fullName: 'Mike Inspector',
        abn: '12345678901',
        insuranceFileKey: 'ins-key-1',
        policeCheckFileKey: 'pc-key-1',
      }),
    );
    // Date fields are converted to Date objects.
    const call = vi.mocked(inspectorRepo.update).mock.calls[0]![1];
    expect(call.dateOfBirth).toBeInstanceOf(Date);
    expect(call.insuranceExpiresAt).toBeInstanceOf(Date);
    expect(call.policeCheckExpiresAt).toBeInstanceOf(Date);
  });

  it('clears nullable profile fields when set to null', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ fullName: 'Old Name', abn: '999', dateOfBirth: new Date('2000-01-01') }),
    );

    await useCase.execute({
      inspectorId: 'inspector-1',
      data: { fullName: null, abn: null, dateOfBirth: null },
      actor: makeActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(
      'inspector-1',
      expect.objectContaining({
        fullName: null,
        abn: null,
        dateOfBirth: null,
      }),
    );
  });

  it('should throw INSPECTOR_EMAIL_CONFLICT on email change', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(
      makeInspector({ id: 'inspector-2', email: 'existing@example.com' }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        data: { email: 'existing@example.com' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorEmailConflictError);
  });
});
