import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorSelfProfileUseCase } from '../../../src/modules/inspector/application/use-cases/update-inspector-self-profile.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: INSPECTOR_ID,
    userId: 'user-insp-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61412345678',
    status: 'ACTIVE',
    paymentSettingsJson: { bankBsb: '062-000', bankAccount: '12345678' },
    serviceTypesJson: [],
    clientEligibilityJson: [],
    blockedClientsJson: [],
    fullName: 'John Michael Inspector',
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    insuranceMetaJson: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeInspActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp-1',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: INSPECTOR_ID,
    ...overrides,
  };
}

describe('UpdateInspectorSelfProfileUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let useCase: UpdateInspectorSelfProfileUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateInspectorSelfProfileUseCase(inspectorRepo, auditService);
  });

  it('should update phone for INSP self', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61499999999' },
      actor: makeInspActor(),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      phone: '+61499999999',
    });
  });

  it('should update fullName for INSP self', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { fullName: 'John M. Inspector' },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      fullName: 'John M. Inspector',
    });
  });

  it('should update paymentSettings for INSP self', async () => {
    const newPayment = { bankBsb: '063-000', bankAccount: '87654321' };

    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { paymentSettings: newPayment },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      paymentSettingsJson: newPayment,
    });
  });

  it('should update only provided fields (partial update)', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61411111111' },
      actor: makeInspActor(),
    });

    const updateCall = vi.mocked(inspectorRepo.update).mock.calls[0]![1]!;
    expect(updateCall).toHaveProperty('phone');
    expect(updateCall).not.toHaveProperty('fullName');
    expect(updateCall).not.toHaveProperty('paymentSettingsJson');
  });

  it('should allow setting phone to null', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: null },
      actor: makeInspActor(),
    });

    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      phone: null,
    });
  });

  it('should throw ForbiddenError when non-INSP role tries to self-update', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: { ...makeInspActor(), role: 'OP' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw ForbiddenError when INSP tries to update another inspector', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: makeInspActor({ inspectorId: 'other-inspector-id' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        data: { phone: '+61400000000' },
        actor: makeInspActor(),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should audit the self-profile update', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      data: { phone: '+61499999999' },
      actor: makeInspActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.self_profile_updated',
        actorType: 'USER',
        actorId: 'user-insp-1',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
      }),
    );
  });
});
