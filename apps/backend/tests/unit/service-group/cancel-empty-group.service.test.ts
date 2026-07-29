import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelEmptyGroupService } from '../../../src/modules/service-group/application/services/cancel-empty-group.service';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { DomainEventBus, SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

type MemberStatus = string;

function makeGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 0,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-07-20'),
    timeWindow: '09:00-12:00',
    name: null,
    regionName: null,
    description: null,
    assignedInspectorId: null,
    serviceRegionId: 'region-1',
    publishedAt: new Date(),
    assignedAt: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

/** Only the fields the service reads — the real payload is much wider. */
function makeMember(status: MemberStatus, id = 'appt-1') {
  return { id, status, serviceGroupId: 'group-1' };
}

function found(group: ServiceGroupEntity, memberStatuses: MemberStatus[]) {
  return {
    group,
    tenantIds: ['tenant-1'],
    primaryTenantId: 'tenant-1',
    agencies: [],
    appointments: memberStatuses.map((s, i) => makeMember(s, `appt-${i + 1}`)),
  };
}

const serviceGroupRepo = {
  findById: vi.fn(),
  update: vi.fn(),
  cancelOptimistic: vi.fn(),
  unlinkAppointments: vi.fn(),
  revertScheduledAppointments: vi.fn(),
};
const auditService = { log: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeService(eventBus?: DomainEventBus) {
  return new CancelEmptyGroupService(
    serviceGroupRepo as any,
    auditService as any,
    logger as any,
    eventBus,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceGroupRepo.update.mockResolvedValue(undefined);
  // 1 = this caller claimed the transition.
  serviceGroupRepo.cancelOptimistic.mockResolvedValue(1);
});

describe('CancelEmptyGroupService.cancelIfDead', () => {
  it('cancels a PUBLISHED group with no members at all', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));

    const cancelled = await makeService().cancelIfDead('group-1');

    expect(cancelled).toBe(true);
    expect(serviceGroupRepo.cancelOptimistic).toHaveBeenCalledWith('group-1', 'PUBLISHED');
  });

  it('cancels an ACCEPTED group whose every member is CANCELLED or REJECTED', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      found(makeGroup({ status: 'ACCEPTED' }), ['CANCELLED', 'REJECTED', 'CANCELLED']),
    );

    expect(await makeService().cancelIfDead('group-1')).toBe(true);
    // Guarded on the status we actually read, not a hardcoded one.
    expect(serviceGroupRepo.cancelOptimistic).toHaveBeenCalledWith('group-1', 'ACCEPTED');
  });

  it('leaves a group alone when ANY member is DONE — the work actually happened', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      found(makeGroup({ status: 'ACCEPTED' }), ['DONE', 'CANCELLED']),
    );

    expect(await makeService().cancelIfDead('group-1')).toBe(false);
    expect(serviceGroupRepo.cancelOptimistic).not.toHaveBeenCalled();
  });

  it('leaves a group alone when a member is still live', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      found(makeGroup({ status: 'PUBLISHED' }), ['CANCELLED', 'AWAITING_INSPECTOR']),
    );

    expect(await makeService().cancelIfDead('group-1')).toBe(false);
    expect(serviceGroupRepo.cancelOptimistic).not.toHaveBeenCalled();
  });

  it('never touches a DRAFT group — DRAFT is the repair state for republishing', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'DRAFT' }), []));

    expect(await makeService().cancelIfDead('group-1')).toBe(false);
    expect(serviceGroupRepo.cancelOptimistic).not.toHaveBeenCalled();
  });

  it('is a no-op for an already terminal group', async () => {
    for (const status of ['CANCELLED', 'REJECTED']) {
      vi.clearAllMocks();
      serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status }), []));

      expect(await makeService().cancelIfDead('group-1')).toBe(false);
      expect(serviceGroupRepo.cancelOptimistic).not.toHaveBeenCalled();
    }
  });

  it('is a no-op when the group does not exist', async () => {
    serviceGroupRepo.findById.mockResolvedValue(null);

    expect(await makeService().cancelIfDead('nope')).toBe(false);
    expect(serviceGroupRepo.cancelOptimistic).not.toHaveBeenCalled();
  });

  it('does NOT unlink the terminal members — that would erase their group history', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      found(makeGroup({ status: 'ACCEPTED' }), ['CANCELLED']),
    );

    await makeService().cancelIfDead('group-1');

    expect(serviceGroupRepo.unlinkAppointments).not.toHaveBeenCalled();
    // No live members exist by definition, so reverting is dead work.
    expect(serviceGroupRepo.revertScheduledAppointments).not.toHaveBeenCalled();
  });

  it('audits the cancellation as SYSTEM with no actor id', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));

    await makeService().cancelIfDead('group-1');

    expect(auditService.log).toHaveBeenCalledOnce();
    const entry = auditService.log.mock.calls[0]![0];
    expect(entry).toMatchObject({
      action: 'service_group.cancelled',
      actorType: 'SYSTEM',
      entityType: 'ServiceGroup',
      entityId: 'group-1',
      tenantId: 'tenant-1',
      before: { status: 'PUBLISHED' },
      after: { status: 'CANCELLED' },
    });
    expect(entry.actorId).toBeUndefined();
    expect(entry.reason).toBeTruthy();
  });

  it('emits the group-cancelled domain event', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));
    const bus = new DomainEventBus();
    const received: any[] = [];
    bus.subscribe(SERVICE_GROUP_EVENTS.CANCELLED, async (e) => { received.push(e); });

    await makeService(bus).cancelIfDead('group-1');

    expect(received).toHaveLength(1);
    expect(received[0].payload).toMatchObject({ groupId: 'group-1', tenantId: 'tenant-1' });
  });

  // Bulk-cancelling a group's appointments fires one transition event per member,
  // and the subscriber is invoked fire-and-forget — so several calls can race for
  // the same group. Only the writer that actually claims the row may log and emit.
  it('skips audit and event when another writer already cancelled the group', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));
    serviceGroupRepo.cancelOptimistic.mockResolvedValue(0); // race lost
    const bus = new DomainEventBus();
    const received: any[] = [];
    bus.subscribe(SERVICE_GROUP_EVENTS.CANCELLED, async (e) => { received.push(e); });

    expect(await makeService(bus).cancelIfDead('group-1')).toBe(false);

    expect(auditService.log).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('produces exactly one audit row and one event across concurrent callers', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));
    // Only the first caller claims the row; the rest see 0 rows updated.
    let claimed = false;
    serviceGroupRepo.cancelOptimistic.mockImplementation(async () => {
      if (claimed) return 0;
      claimed = true;
      return 1;
    });
    const bus = new DomainEventBus();
    const received: any[] = [];
    bus.subscribe(SERVICE_GROUP_EVENTS.CANCELLED, async (e) => { received.push(e); });

    const service = makeService(bus);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => service.cancelIfDead('group-1')),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(auditService.log).toHaveBeenCalledOnce();
    expect(received).toHaveLength(1);
  });

  it('reads the group cross-tenant — groups are tenant-agnostic', async () => {
    serviceGroupRepo.findById.mockResolvedValue(found(makeGroup({ status: 'PUBLISHED' }), []));

    await makeService().cancelIfDead('group-1');

    expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', null);
  });
});
