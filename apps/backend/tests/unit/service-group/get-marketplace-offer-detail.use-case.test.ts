import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMarketplaceOfferDetailUseCase } from '../../../src/modules/service-group/application/use-cases/get-marketplace-offer-detail.use-case';
import type { IServiceGroupRepository, MarketplaceOfferDetail } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { InspectorInactiveError } from '../../../src/modules/service-group/domain/service-group.errors';

function makeInspector(overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {}): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@inspectors.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }],
    clientEligibilityJson: [{ tenantId: 'tenant-1', eligible: true }],
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

function makeOfferDetail(overrides: Partial<MarketplaceOfferDetail> = {}): MarketplaceOfferDetail {
  return {
    groupId: 'group-1',
    tenantId: 'tenant-1',
    tenantName: 'Acme Realty',
    serviceTypeName: 'Routine Inspection',
    groupSize: 5,
    scheduledDate: new Date('2026-04-01'),
    timeWindow: '08:00-12:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    suburbs: ['Sydney', 'Bondi'],
    payoutEstimate: 250,
    appointmentCount: 5,
    addresses: ['10 Main St, Sydney', '20 Beach Rd, Bondi'],
    keyRequired: true,
    notes: 'Ring the doorbell',
    appointments: [
      {
        id: 'appt-1',
        appointmentNumber: 1001,
        address: '10 Main St, Sydney',
        keyRequired: true,
        notes: 'Ring the doorbell',
        payoutAmount: 50,
      },
      {
        id: 'appt-2',
        appointmentNumber: 1002,
        address: '20 Beach Rd, Bondi',
        keyRequired: false,
        notes: null,
        payoutAmount: 50,
      },
    ],
    ...overrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: 'inspector-1',
    ...overrides,
  };
}

describe('GetMarketplaceOfferDetailUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let inspectorRepo: IInspectorRepository;
  let useCase: GetMarketplaceOfferDetailUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      findPublishedForInspector: vi.fn(),
      countPublishedForInspector: vi.fn(),
      findPublishedOfferDetail: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    };
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      setServiceRegions: vi.fn(),
      findByRegionId: vi.fn(),
    };

    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new GetMarketplaceOfferDetailUseCase(serviceGroupRepo, inspectorRepo, authorizationService);
  });

  it('should return full offer detail for eligible inspector', async () => {
    const detail = makeOfferDetail();
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findPublishedOfferDetail).mockResolvedValue(detail);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(result.groupId).toBe('group-1');
    expect(result.tenantName).toBe('Acme Realty');
    expect(result.addresses).toEqual(['10 Main St, Sydney', '20 Beach Rd, Bondi']);
    expect(result.keyRequired).toBe(true);
    expect(result.notes).toBe('Ring the doorbell');
    expect(result.appointments).toHaveLength(2);
    expect(result.appointments[0].appointmentNumber).toBe(1001);
    expect(result.appointments[0].keyRequired).toBe(true);
    expect(result.appointments[1].keyRequired).toBe(false);
    expect(result.payoutEstimate).toBe(250);

    expect(serviceGroupRepo.findPublishedOfferDetail).toHaveBeenCalledWith(
      'group-1',
      'inspector-1',
      ['svc-type-1'],
      ['tenant-1'],
    );
  });

  it('should reject non-INSP actors with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(inspectorRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw InspectorInactiveError for inactive inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorInactiveError);
  });

  it('should throw NotFoundError when group is not found or inspector not eligible', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findPublishedOfferDetail).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent-group',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
