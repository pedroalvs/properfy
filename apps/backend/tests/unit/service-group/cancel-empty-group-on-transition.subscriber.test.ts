import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelEmptyGroupOnTransitionSubscriber } from '../../../src/modules/service-group/application/subscribers/cancel-empty-group-on-transition.subscriber';
import { DomainEventBus, APPOINTMENT_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import type { AppointmentTransitionEvent } from '@properfy/shared';

const cancelEmptyGroup = { cancelIfDead: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeBus() {
  const bus = new DomainEventBus();
  new CancelEmptyGroupOnTransitionSubscriber(cancelEmptyGroup as any, logger as any).register(bus);
  return bus;
}

function emit(bus: DomainEventBus, payload: Partial<AppointmentTransitionEvent>) {
  return bus.emit({
    type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
    payload: {
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      fromStatus: 'SCHEDULED',
      toStatus: 'CANCELLED',
      actorId: 'user-1',
      actorType: 'USER',
      ...payload,
    } as unknown as Record<string, unknown>,
    occurredAt: new Date(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelEmptyGroup.cancelIfDead.mockResolvedValue(false);
});

describe('CancelEmptyGroupOnTransitionSubscriber', () => {
  it('checks the group when an appointment is cancelled', async () => {
    await emit(makeBus(), { toStatus: 'CANCELLED', serviceGroupId: 'sg-1' });

    expect(cancelEmptyGroup.cancelIfDead).toHaveBeenCalledWith('sg-1');
  });

  it('checks the group when an appointment is rejected', async () => {
    await emit(makeBus(), { toStatus: 'REJECTED', serviceGroupId: 'sg-1' });

    expect(cancelEmptyGroup.cancelIfDead).toHaveBeenCalledWith('sg-1');
  });

  it('ignores a transition to DONE — a DONE member keeps the group alive', async () => {
    await emit(makeBus(), { toStatus: 'DONE', serviceGroupId: 'sg-1' });

    expect(cancelEmptyGroup.cancelIfDead).not.toHaveBeenCalled();
  });

  it('ignores non-terminal transitions', async () => {
    const bus = makeBus();
    await emit(bus, { toStatus: 'SCHEDULED', serviceGroupId: 'sg-1' });
    await emit(bus, { toStatus: 'AWAITING_INSPECTOR', serviceGroupId: 'sg-1' });
    await emit(bus, { toStatus: 'DRAFT', serviceGroupId: 'sg-1' });

    expect(cancelEmptyGroup.cancelIfDead).not.toHaveBeenCalled();
  });

  it('ignores an ungrouped appointment', async () => {
    const bus = makeBus();
    await emit(bus, { toStatus: 'CANCELLED', serviceGroupId: null });
    await emit(bus, { toStatus: 'CANCELLED', serviceGroupId: undefined });

    expect(cancelEmptyGroup.cancelIfDead).not.toHaveBeenCalled();
  });

  it('swallows a cleanup failure so the transition is never affected', async () => {
    cancelEmptyGroup.cancelIfDead.mockRejectedValueOnce(new Error('db down'));

    await expect(
      emit(makeBus(), { toStatus: 'CANCELLED', serviceGroupId: 'sg-1' }),
    ).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
