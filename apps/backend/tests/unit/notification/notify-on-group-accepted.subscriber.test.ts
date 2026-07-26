import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DomainEventBus,
  SERVICE_GROUP_EVENTS,
} from '../../../src/shared/application/events/domain-event-bus';
import { NotifyOnGroupAcceptedSubscriber } from '../../../src/modules/notification/application/subscribers/notify-on-group-accepted.subscriber';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';

const GROUP_ID = 'group-1';

function makeAppointment(overrides: Partial<{ id: string; status: string; tenantId: string }> = {}) {
  return {
    id: overrides.id ?? 'appt-1',
    appointmentNumber: 1,
    status: overrides.status ?? 'SCHEDULED',
    serviceTypeId: 'st-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    propertyId: 'prop-1',
    serviceGroupId: GROUP_ID,
    scheduledDate: new Date('2026-08-01'),
    propertyAddress: '1 Main St',
    propertyCode: 'PROP-0001',
  };
}

function makeGroupResult(appointments: ReturnType<typeof makeAppointment>[]) {
  return {
    group: {} as never,
    assignedInspectorName: 'Insp One',
    tenantIds: [...new Set(appointments.map((a) => a.tenantId))],
    primaryTenantId: null,
    agencies: [],
    appointments,
  };
}

describe('NotifyOnGroupAcceptedSubscriber', () => {
  let bus: DomainEventBus;
  let serviceGroupRepo: { findById: ReturnType<typeof vi.fn> };
  let notifyHandler: { execute: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bus = new DomainEventBus();
    serviceGroupRepo = { findById: vi.fn() };
    notifyHandler = { execute: vi.fn().mockResolvedValue(undefined) };
    logger = { warn: vi.fn() };

    new NotifyOnGroupAcceptedSubscriber(
      serviceGroupRepo as unknown as IServiceGroupRepository,
      notifyHandler as unknown as NotifyOnStatusTransitionHandler,
      logger as never,
    ).register(bus);
  });

  function emit(type: string) {
    return bus.emit({
      type,
      payload: { groupId: GROUP_ID, tenantId: null, inspectorId: 'insp-1' },
      occurredAt: new Date('2026-07-23T10:00:00Z'),
    });
  }

  it('notifies each scheduled appointment on ACCEPTED with its own tenantId', async () => {
    const appointments = [
      makeAppointment({ id: 'appt-1', tenantId: 'tenant-1' }),
      makeAppointment({ id: 'appt-2', tenantId: 'tenant-2' }),
    ];
    serviceGroupRepo.findById.mockResolvedValue(makeGroupResult(appointments));

    await emit(SERVICE_GROUP_EVENTS.ACCEPTED);

    expect(serviceGroupRepo.findById).toHaveBeenCalledWith(GROUP_ID, null);
    expect(notifyHandler.execute).toHaveBeenCalledTimes(2);
    expect(notifyHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });
    expect(notifyHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-2',
      tenantId: 'tenant-2',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });
  });

  it('notifies on MANUALLY_ASSIGNED with the same fan-out', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([makeAppointment({ id: 'appt-1' })]),
    );

    await emit(SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED);

    expect(notifyHandler.execute).toHaveBeenCalledTimes(1);
    expect(notifyHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });
  });

  it('still notifies remaining appointments when one handler call fails', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([
        makeAppointment({ id: 'appt-1' }),
        makeAppointment({ id: 'appt-2' }),
      ]),
    );
    notifyHandler.execute
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);

    await expect(emit(SERVICE_GROUP_EVENTS.ACCEPTED)).resolves.toBeUndefined();

    expect(notifyHandler.execute).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does nothing when the group is not found', async () => {
    serviceGroupRepo.findById.mockResolvedValue(null);

    await expect(emit(SERVICE_GROUP_EVENTS.ACCEPTED)).resolves.toBeUndefined();

    expect(notifyHandler.execute).not.toHaveBeenCalled();
  });

  it('does not throw when the repository lookup fails', async () => {
    serviceGroupRepo.findById.mockRejectedValue(new Error('db down'));

    await expect(emit(SERVICE_GROUP_EVENTS.ACCEPTED)).resolves.toBeUndefined();

    expect(notifyHandler.execute).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips appointments that are not currently SCHEDULED', async () => {
    serviceGroupRepo.findById.mockResolvedValue(
      makeGroupResult([
        makeAppointment({ id: 'appt-1', status: 'SCHEDULED' }),
        makeAppointment({ id: 'appt-2', status: 'CANCELLED' }),
      ]),
    );

    await emit(SERVICE_GROUP_EVENTS.ACCEPTED);

    expect(notifyHandler.execute).toHaveBeenCalledTimes(1);
    expect(notifyHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-1' }),
    );
  });
});
