import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyInspectorsOnRegionDeactivationHandler } from '../../../src/modules/service-region/application/handlers/notify-inspectors-on-region-deactivation.handler';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import type { DomainEvent } from '../../../src/shared/application/events/domain-event-bus';

function makeInspector(overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {}): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    userId: null,
    name: 'John Inspector',
    email: 'john@example.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    clientEligibilityJson: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeEvent(overrides: Partial<DomainEvent['payload']> = {}): DomainEvent {
  return {
    type: 'service_region.deactivated.v1',
    payload: {
      regionId: 'region-1',
      tenantId: 'tenant-1',
      regionName: 'Sydney CBD',
      ...overrides,
    },
    occurredAt: new Date(),
  };
}

describe('NotifyInspectorsOnRegionDeactivationHandler', () => {
  let inspectorRepo: IInspectorRepository;
  let createNotification: CreateNotificationUseCase;
  let handler: NotifyInspectorsOnRegionDeactivationHandler;

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
    createNotification = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    } as unknown as CreateNotificationUseCase;
    handler = new NotifyInspectorsOnRegionDeactivationHandler(inspectorRepo, createNotification);
  });

  it('should send notifications to all inspectors mapped to the deactivated region', async () => {
    const inspector1 = makeInspector({ id: 'insp-1', name: 'Alice', email: 'alice@example.com' });
    const inspector2 = makeInspector({ id: 'insp-2', name: 'Bob', email: 'bob@example.com' });
    vi.mocked(inspectorRepo.findByRegionId).mockResolvedValue([inspector1, inspector2]);

    await handler.handle(makeEvent());

    expect(inspectorRepo.findByRegionId).toHaveBeenCalledWith('region-1');
    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(createNotification.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      recipient: 'alice@example.com',
      channel: 'EMAIL',
      templateCode: 'REGION_DEACTIVATED',
      payloadJson: { inspectorName: 'Alice', regionName: 'Sydney CBD' },
    });
    expect(createNotification.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      recipient: 'bob@example.com',
      channel: 'EMAIL',
      templateCode: 'REGION_DEACTIVATED',
      payloadJson: { inspectorName: 'Bob', regionName: 'Sydney CBD' },
    });
  });

  it('should not send notifications when no inspectors are mapped to the region', async () => {
    vi.mocked(inspectorRepo.findByRegionId).mockResolvedValue([]);

    await handler.handle(makeEvent());

    expect(inspectorRepo.findByRegionId).toHaveBeenCalledWith('region-1');
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('should not throw when one notification fails (fire-and-forget)', async () => {
    const inspector1 = makeInspector({ id: 'insp-1', name: 'Alice', email: 'alice@example.com' });
    const inspector2 = makeInspector({ id: 'insp-2', name: 'Bob', email: 'bob@example.com' });
    vi.mocked(inspectorRepo.findByRegionId).mockResolvedValue([inspector1, inspector2]);
    vi.mocked(createNotification.execute)
      .mockRejectedValueOnce(new Error('Email service down'))
      .mockResolvedValueOnce({ notificationId: 'notif-2' });

    await expect(handler.handle(makeEvent())).resolves.not.toThrow();

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });
});
