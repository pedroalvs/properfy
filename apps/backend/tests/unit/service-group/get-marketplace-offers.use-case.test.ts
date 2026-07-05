import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMarketplaceOffersUseCase } from '../../../src/modules/service-group/application/use-cases/get-marketplace-offers.use-case';
import type { IServiceGroupRepository, MarketplaceOffer } from '../../../src/modules/service-group/domain/service-group.repository';
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

function makeMarketplaceOffer(overrides: Partial<MarketplaceOffer> = {}): MarketplaceOffer {
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
    payoutEstimate: null,
    appointmentCount: 5,
    ...overrides,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: 'insp-1',
    ...overrides,
  };
}

const defaultPagination = { page: 1, pageSize: 20, sortOrder: 'asc' as const };

describe('GetMarketplaceOffersUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let inspectorRepo: IInspectorRepository;
  let useCase: GetMarketplaceOffersUseCase;

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
    useCase = new GetMarketplaceOffersUseCase(serviceGroupRepo, inspectorRepo, authorizationService);
  });

  it('should return offers for eligible inspector', async () => {
    const offers = [
      makeMarketplaceOffer({ groupId: 'group-1' }),
      makeMarketplaceOffer({ groupId: 'group-2', groupSize: 8 }),
    ];
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findPublishedForInspector).mockResolvedValue(offers);
    vi.mocked(serviceGroupRepo.countPublishedForInspector).mockResolvedValue(2);

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      pagination: defaultPagination,
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data[0].groupId).toBe('group-1');
    expect(result.data[1].groupId).toBe('group-2');
    expect(result.data[0].tenantName).toBe('Acme Realty');
    expect(result.data[0].suburbs).toEqual(['Sydney', 'Bondi']);
  });

  it('should reject non-INSP actors', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        pagination: defaultPagination,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw NotFoundError for missing inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'nonexistent',
        pagination: defaultPagination,
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
        inspectorId: 'inspector-1',
        pagination: defaultPagination,
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorInactiveError);
  });

  it('should return empty when no eligible offers', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findPublishedForInspector).mockResolvedValue([]);
    vi.mocked(serviceGroupRepo.countPublishedForInspector).mockResolvedValue(0);

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      pagination: defaultPagination,
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('passes serviceTypes and the blocked-clients denylist to the repository', async () => {
    const inspector = makeInspector({
      serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }, { serviceTypeId: 'svc-type-2', certified: false }],
      blockedClientsJson: ['tenant-blocked-1', 'tenant-blocked-2'],
    });
    vi.mocked(inspectorRepo.findById).mockResolvedValue(inspector);
    vi.mocked(serviceGroupRepo.findPublishedForInspector).mockResolvedValue([]);
    vi.mocked(serviceGroupRepo.countPublishedForInspector).mockResolvedValue(0);

    await useCase.execute({
      inspectorId: 'inspector-1',
      pagination: defaultPagination,
      actor: makeActor(),
    });

    // Use case forwards inspector.blockedClientsJson (denylist) so it agrees
    // with the AcceptOfferUseCase tenant-eligibility check.
    expect(serviceGroupRepo.findPublishedForInspector).toHaveBeenCalledWith(
      'inspector-1',
      ['svc-type-1', 'svc-type-2'],
      ['tenant-blocked-1', 'tenant-blocked-2'],
      defaultPagination,
    );
    expect(serviceGroupRepo.countPublishedForInspector).toHaveBeenCalledWith(
      'inspector-1',
      ['svc-type-1', 'svc-type-2'],
      ['tenant-blocked-1', 'tenant-blocked-2'],
    );
  });

  it('passes empty denylist to repository when inspector blocks no tenants', async () => {
    const inspector = makeInspector({
      serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }],
      blockedClientsJson: [],
    });
    vi.mocked(inspectorRepo.findById).mockResolvedValue(inspector);
    vi.mocked(serviceGroupRepo.findPublishedForInspector).mockResolvedValue([]);
    vi.mocked(serviceGroupRepo.countPublishedForInspector).mockResolvedValue(0);

    await useCase.execute({
      inspectorId: 'inspector-1',
      pagination: defaultPagination,
      actor: makeActor(),
    });

    expect(serviceGroupRepo.findPublishedForInspector).toHaveBeenCalledWith(
      'inspector-1',
      ['svc-type-1'],
      [],
      defaultPagination,
    );
  });
});
