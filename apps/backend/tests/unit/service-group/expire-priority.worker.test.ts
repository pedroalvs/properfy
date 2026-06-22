import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpirePriorityWorker } from '../../../src/modules/service-group/infrastructure/workers/expire-priority.worker';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';

function makeGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 5,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    priorityMode: 'PRIORITY_24H',
    priorityExpiresAt: new Date('2026-04-01T00:00:00Z'),
    assignedInspectorId: null,
    publishedAt: new Date('2026-03-31T00:00:00Z'),
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    serviceRegionId: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('ExpirePriorityWorker', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let logger: Logger;
  let worker: ExpirePriorityWorker;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
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
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    worker = new ExpirePriorityWorker(serviceGroupRepo, auditService, logger);
  });

  it('should cancel expired published groups with system audit', async () => {
    const group1 = makeGroup({ id: 'group-1' });
    const group2 = makeGroup({ id: 'group-2' });
    vi.mocked(serviceGroupRepo.findExpiredPublished).mockResolvedValue([group1, group2]);
    // The worker derives the tenant tag from the group's appointments via findById.
    vi.mocked(serviceGroupRepo.findById).mockImplementation(async (id) => ({
      group: makeGroup({ id }),
      assignedInspectorName: null,
      tenantIds: [id === 'group-1' ? 'tenant-1' : 'tenant-2'],
      primaryTenantId: id === 'group-1' ? 'tenant-1' : 'tenant-2',
      agencies: [{ id: id === 'group-1' ? 'tenant-1' : 'tenant-2', name: 'Agency' }],
      appointments: [],
    }));

    const result = await worker.execute();

    expect(result.expiredCount).toBe(2);

    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', { status: 'CANCELLED' });
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-2', { status: 'CANCELLED' });

    expect(serviceGroupRepo.unlinkAppointments).toHaveBeenCalledWith('group-1');
    expect(serviceGroupRepo.unlinkAppointments).toHaveBeenCalledWith('group-2');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.cancelled',
        actorType: 'SYSTEM',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'PUBLISHED' },
        after: { status: 'CANCELLED' },
        reason: 'Priority window expired (system auto-cancel)',
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.cancelled',
        actorType: 'SYSTEM',
        entityType: 'ServiceGroup',
        entityId: 'group-2',
        tenantId: 'tenant-2',
        before: { status: 'PUBLISHED' },
        after: { status: 'CANCELLED' },
        reason: 'Priority window expired (system auto-cancel)',
      }),
    );
  });

  it('should return count 0 when no expired groups exist', async () => {
    vi.mocked(serviceGroupRepo.findExpiredPublished).mockResolvedValue([]);

    const result = await worker.execute();

    expect(result.expiredCount).toBe(0);
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    expect(serviceGroupRepo.unlinkAppointments).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should continue processing remaining groups when one fails', async () => {
    const group1 = makeGroup({ id: 'group-fail' });
    const group2 = makeGroup({ id: 'group-ok' });
    vi.mocked(serviceGroupRepo.findExpiredPublished).mockResolvedValue([group1, group2]);
    vi.mocked(serviceGroupRepo.update)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    const result = await worker.execute();

    expect(result.expiredCount).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-fail' }),
      'Failed to auto-cancel expired priority group',
    );
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-ok', { status: 'CANCELLED' });
    expect(serviceGroupRepo.unlinkAppointments).toHaveBeenCalledWith('group-ok');
  });
});
