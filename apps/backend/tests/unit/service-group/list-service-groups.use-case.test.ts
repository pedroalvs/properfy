import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListServiceGroupsUseCase } from '../../../src/modules/service-group/application/use-cases/list-service-groups.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

function makeGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'DRAFT',
    groupSize: 5,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    assignedInspectorId: null,
    publishedAt: null,
    assignedAt: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

const defaultPagination = {
  page: 1,
  pageSize: 10,
  sortOrder: 'desc' as const,
};

describe('ListServiceGroupsUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let useCase: ListServiceGroupsUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findAppointmentsForMapByGroupIds: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      findPublishedForInspector: vi.fn(),
      findPublishedOfferDetail: vi.fn(),
      countPublishedForInspector: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    } as unknown as IServiceGroupRepository;
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new ListServiceGroupsUseCase(serviceGroupRepo, authorizationService);
  });

  it('should return paginated results for AM', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([{ group: makeGroup(), assignedInspectorName: null, primaryTenantId: 'tenant-1', agencies: [{ id: 'tenant-1', name: 'Agency tenant-1' }] }]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe('group-1');
    expect(result.data[0].tenantId).toBe('tenant-1');
    expect(result.data[0].status).toBe('DRAFT');
  });

  it('should scope OP to their tenant', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([{ group: makeGroup(), assignedInspectorName: null, primaryTenantId: 'tenant-1', agencies: [{ id: 'tenant-1', name: 'Agency tenant-1' }] }]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);

    await useCase.execute({
      filters: { tenantId: 'tenant-other' }, // OP cannot override
      pagination: defaultPagination,
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    // Should always use the OP's tenantId
    expect(serviceGroupRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      defaultPagination,
    );
    expect(serviceGroupRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should pass filters to repository', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: {
        tenantId: 'tenant-1',
        status: 'PUBLISHED',
        serviceTypeId: 'svc-1',
      },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(serviceGroupRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'PUBLISHED',
        serviceTypeId: 'svc-1',
      }),
      defaultPagination,
    );
  });

  it('should return empty list when no groups found', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should map all summary fields correctly', async () => {
    const publishedAt = new Date('2026-05-15');
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      {
        group: makeGroup({
          id: 'group-2',
          status: 'PUBLISHED',
          offeredCount: 3,
          confirmedCount: 1,
          assignedInspectorId: 'insp-1',
          publishedAt,
        }),
        assignedInspectorName: 'Carlos Silva',
      },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    const group = result.data[0];
    expect(group.id).toBe('group-2');
    expect(group.status).toBe('PUBLISHED');
    expect(group.offeredCount).toBe(3);
    expect(group.confirmedCount).toBe(1);
    expect(group.assignedInspectorId).toBe('insp-1');
    expect(group.assignedInspectorName).toBe('Carlos Silva');
    expect(group.publishedAt).toEqual(publishedAt);
  });

  // Map page integration: when includeAppointments=true, appointments are
  // batch-fetched and embedded per group, with property coordinates populated.
  it('embeds appointments per group when includeAppointments is true', async () => {
    // groupSize is the repository's derived count of linked appointments, and
    // the map query below filters on the same predicate — so the fixture keeps
    // them consistent, one appointment each.
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      { group: makeGroup({ id: 'group-1', groupSize: 1 }), assignedInspectorName: null },
      { group: makeGroup({ id: 'group-2', groupSize: 1 }), assignedInspectorName: 'Mike' },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(2);
    vi.mocked(serviceGroupRepo.findAppointmentsForMapByGroupIds).mockResolvedValue([
      {
        id: 'apt-1',
        serviceGroupId: 'group-1',
        code: 'VST-001',
        status: 'AWAITING_INSPECTOR',
        address: '10 Main St, Sydney',
        latitude: -33.8,
        longitude: 151.2,
        scheduledDate: new Date('2026-05-01T00:00:00Z'),
        inspectorName: null,
      },
      {
        id: 'apt-2',
        serviceGroupId: 'group-2',
        code: 'VST-002',
        status: 'SCHEDULED',
        address: '20 Beach Rd, Bondi',
        latitude: -33.9,
        longitude: 151.3,
        scheduledDate: new Date('2026-05-02T00:00:00Z'),
        inspectorName: 'Mike',
      },
    ]);

    const result = await useCase.execute({
      filters: { includeAppointments: true },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(serviceGroupRepo.findAppointmentsForMapByGroupIds).toHaveBeenCalledWith(['group-1', 'group-2']);
    expect(result.data[0]!.appointmentsCount).toBe(1);
    expect(result.data[0]!.appointments).toEqual([
      expect.objectContaining({
        id: 'apt-1',
        code: 'VST-001',
        latitude: -33.8,
        longitude: 151.2,
        inspectorName: null,
      }),
    ]);
    expect(result.data[1]!.appointments?.[0]?.inspectorName).toBe('Mike');
  });

  // The map warns "0 of N appointments have a valid map location". N must be
  // the number of appointments LINKED to the group — counting only the
  // plottable ones makes it read "0 of 0" for precisely the groups that need
  // explaining.
  it('counts every linked appointment, but only embeds the plottable ones', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      { group: makeGroup({ id: 'group-1', groupSize: 2 }), assignedInspectorName: null },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.findAppointmentsForMapByGroupIds).mockResolvedValue([
      {
        id: 'apt-1',
        serviceGroupId: 'group-1',
        code: 'VST-001',
        status: 'SCHEDULED',
        address: '10 Main St, Sydney',
        latitude: -33.8,
        longitude: 151.2,
        scheduledDate: new Date('2026-05-01T00:00:00Z'),
        inspectorName: null,
      },
      {
        id: 'apt-2',
        serviceGroupId: 'group-1',
        code: 'VST-002',
        status: 'SCHEDULED',
        address: '20 Ungeocoded Rd',
        latitude: null,
        longitude: null,
        scheduledDate: new Date('2026-05-02T00:00:00Z'),
        inspectorName: null,
      },
    ]);

    const result = await useCase.execute({
      filters: { includeAppointments: true },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0]!.appointmentsCount).toBe(2);
    expect(result.data[0]!.appointments).toHaveLength(1);
    expect(result.data[0]!.appointments?.[0]?.id).toBe('apt-1');
  });

  it('reports an emptied group as zero, so the map can say "no appointments"', async () => {
    // A cancelled group has had every appointment unlinked. The count is
    // derived, so it reads 0 and the map says "group has no appointments"
    // rather than inventing appointments that no longer exist.
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      { group: makeGroup({ id: 'group-1', groupSize: 0 }), assignedInspectorName: null },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.findAppointmentsForMapByGroupIds).mockResolvedValue([]);

    const result = await useCase.execute({
      filters: { includeAppointments: true },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0]!.appointmentsCount).toBe(0);
    expect(result.data[0]!.groupSize).toBe(0);
  });

  // An appointment whose coordinates exist but are unusable must still be
  // COUNTED — it is a real appointment. Only the embedded array, which feeds
  // markers and the camera fit, drops it.
  it('excludes malformed coordinates from the embedded array but still counts them', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      { group: makeGroup({ id: 'group-1', groupSize: 3 }), assignedInspectorName: null },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.findAppointmentsForMapByGroupIds).mockResolvedValue([
      {
        id: 'apt-ok', serviceGroupId: 'group-1', code: 'VST-001', status: 'SCHEDULED',
        address: '10 Main St', latitude: -33.8, longitude: 151.2,
        scheduledDate: new Date('2026-05-01T00:00:00Z'), inspectorName: null,
      },
      {
        id: 'apt-out-of-range', serviceGroupId: 'group-1', code: 'VST-002', status: 'SCHEDULED',
        address: '20 Bad Rd', latitude: 999, longitude: 151.2,
        scheduledDate: new Date('2026-05-02T00:00:00Z'), inspectorName: null,
      },
      {
        id: 'apt-nan', serviceGroupId: 'group-1', code: 'VST-003', status: 'SCHEDULED',
        address: '30 Bad Rd', latitude: Number.NaN, longitude: 151.2,
        scheduledDate: new Date('2026-05-03T00:00:00Z'), inspectorName: null,
      },
    ]);

    const result = await useCase.execute({
      filters: { includeAppointments: true },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    // A `!= null` filter would have let both malformed rows through, and the
    // frontend would then have rejected them — payload and consumer
    // disagreeing about what "plottable" means.
    expect(result.data[0]!.appointments?.map((a) => a.id)).toEqual(['apt-ok']);
    expect(result.data[0]!.appointmentsCount).toBe(3);
  });

  it('omits the appointments array by default, but still reports the count', async () => {
    vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([
      { group: makeGroup({ groupSize: 5 }), assignedInspectorName: null },
    ]);
    vi.mocked(serviceGroupRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(serviceGroupRepo.findAppointmentsForMapByGroupIds).not.toHaveBeenCalled();
    expect(result.data[0]!.appointments).toBeUndefined();
    // Emitted unconditionally: it is the already-derived count, so gating it on
    // `includeAppointments` only created a state where a consumer could not
    // tell "no appointments" from "the server didn't say".
    expect(result.data[0]!.appointmentsCount).toBe(5);
  });

  describe('search filter', () => {
    it('passes search filter to repository', async () => {
      vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([]);
      vi.mocked(serviceGroupRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { search: 'sydney group' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(serviceGroupRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'sydney group' }),
        defaultPagination,
      );
    });
  });

  describe('branchId filter', () => {
    it('passes branchId filter to repository', async () => {
      vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([]);
      vi.mocked(serviceGroupRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { branchId: 'branch-123' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(serviceGroupRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'branch-123' }),
        defaultPagination,
      );
    });
  });

  describe('contactSearch filter', () => {
    it('passes contactSearch filter to repository', async () => {
      vi.mocked(serviceGroupRepo.findAll).mockResolvedValue([]);
      vi.mocked(serviceGroupRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { contactSearch: 'john' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(serviceGroupRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ contactSearch: 'john' }),
        defaultPagination,
      );
    });
  });
});
