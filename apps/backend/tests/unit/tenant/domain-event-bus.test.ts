import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DomainEventBus,
  TENANT_EVENTS,
  BRANCH_EVENTS,
} from '../../../src/shared/application/events/domain-event-bus';
import type { DomainEvent } from '../../../src/shared/application/events/domain-event-bus';

describe('DomainEventBus', () => {
  let bus: DomainEventBus;

  beforeEach(() => {
    bus = new DomainEventBus();
  });

  it('should call subscriber with the correct event when emitted', async () => {
    const handler = vi.fn();
    bus.subscribe(TENANT_EVENTS.CREATED, handler);

    const event: DomainEvent = {
      type: TENANT_EVENTS.CREATED,
      payload: { tenantId: 'tenant-1', name: 'Test' },
      occurredAt: new Date(),
    };

    await bus.emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should call multiple subscribers for the same event type', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.subscribe(BRANCH_EVENTS.CREATED, handler1);
    bus.subscribe(BRANCH_EVENTS.CREATED, handler2);

    const event: DomainEvent = {
      type: BRANCH_EVENTS.CREATED,
      payload: { branchId: 'branch-1' },
      occurredAt: new Date(),
    };

    await bus.emit(event);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should not error when emitting an event with no subscribers', async () => {
    const event: DomainEvent = {
      type: TENANT_EVENTS.DEACTIVATED,
      payload: { tenantId: 'tenant-1' },
      occurredAt: new Date(),
    };

    await expect(bus.emit(event)).resolves.toBeUndefined();
  });

  it('should remove all subscribers when clear is called', async () => {
    const handler = vi.fn();
    bus.subscribe(TENANT_EVENTS.UPDATED, handler);

    bus.clear();

    await bus.emit({
      type: TENANT_EVENTS.UPDATED,
      payload: {},
      occurredAt: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle async handlers correctly', async () => {
    const order: number[] = [];
    const handler1 = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    const handler2 = vi.fn(async () => {
      order.push(2);
    });
    bus.subscribe(TENANT_EVENTS.ACTIVATED, handler1);
    bus.subscribe(TENANT_EVENTS.ACTIVATED, handler2);

    await bus.emit({
      type: TENANT_EVENTS.ACTIVATED,
      payload: { tenantId: 'tenant-1' },
      occurredAt: new Date(),
    });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(order).toContain(1);
    expect(order).toContain(2);
  });

  it('should not propagate handler errors (fire-and-forget)', async () => {
    const failingHandler = vi.fn(() => {
      throw new Error('handler failure');
    });
    const succeedingHandler = vi.fn();

    bus.subscribe(TENANT_EVENTS.CREATED, failingHandler);
    bus.subscribe(TENANT_EVENTS.CREATED, succeedingHandler);

    const event: DomainEvent = {
      type: TENANT_EVENTS.CREATED,
      payload: { tenantId: 'tenant-1' },
      occurredAt: new Date(),
    };

    await expect(bus.emit(event)).resolves.toBeUndefined();
    expect(failingHandler).toHaveBeenCalledOnce();
    expect(succeedingHandler).toHaveBeenCalledOnce();
  });

  it('should not call subscribers of different event types', async () => {
    const tenantHandler = vi.fn();
    const branchHandler = vi.fn();
    bus.subscribe(TENANT_EVENTS.CREATED, tenantHandler);
    bus.subscribe(BRANCH_EVENTS.CREATED, branchHandler);

    await bus.emit({
      type: TENANT_EVENTS.CREATED,
      payload: {},
      occurredAt: new Date(),
    });

    expect(tenantHandler).toHaveBeenCalledOnce();
    expect(branchHandler).not.toHaveBeenCalled();
  });

  it('should expose correct event type constants', () => {
    expect(TENANT_EVENTS.CREATED).toBe('tenant.created.v1');
    expect(TENANT_EVENTS.UPDATED).toBe('tenant.updated.v1');
    expect(TENANT_EVENTS.ACTIVATED).toBe('tenant.activated.v1');
    expect(TENANT_EVENTS.DEACTIVATED).toBe('tenant.deactivated.v1');

    expect(BRANCH_EVENTS.CREATED).toBe('branch.created.v1');
    expect(BRANCH_EVENTS.UPDATED).toBe('branch.updated.v1');
    expect(BRANCH_EVENTS.ACTIVATED).toBe('branch.activated.v1');
    expect(BRANCH_EVENTS.DEACTIVATED).toBe('branch.deactivated.v1');
  });
});
