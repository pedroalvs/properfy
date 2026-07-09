import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FY_WEBHOOK_JOB,
  FyWebhookSubscriber,
} from '../../../src/modules/fy/application/webhooks/fy-webhook-subscriber';
import { FyWebhookDispatcher } from '../../../src/modules/fy/infrastructure/fy-webhook-dispatcher';
import {
  DomainEventBus,
  APPOINTMENT_EVENTS,
  SERVICE_GROUP_EVENTS,
} from '../../../src/shared/application/events/domain-event-bus';

const CONFIG = { config: { url: 'https://n8n.example/webhook', secret: 's3cret-s3cret' }, source: 'database' as const };

function makeResolver(configured = true) {
  return { getConfig: vi.fn(async () => (configured ? CONFIG : null)) } as any;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('FyWebhookSubscriber', () => {
  const occurredAt = new Date('2026-07-09T10:00:00Z');

  function setup(configured = true) {
    const bus = new DomainEventBus();
    const jobQueue = { enqueue: vi.fn(async () => {}) };
    const fyRepo = {
      findGroupAcceptanceInfo: vi.fn(async () => [
        { appointmentId: 'a1', appointmentNumber: 1, appointmentCodePrefix: 'INS', inspectorId: 'i1', inspectorName: 'Kez' },
        { appointmentId: 'a2', appointmentNumber: 2, appointmentCodePrefix: null, inspectorId: 'i1', inspectorName: 'Kez' },
      ]),
    };
    new FyWebhookSubscriber(makeResolver(configured), fyRepo as any, jobQueue as any).register(bus);
    return { bus, jobQueue, fyRepo };
  }

  it('fans out one inspector.accepted job per appointment in the group', async () => {
    const { bus, jobQueue } = setup();
    await bus.emit({
      type: SERVICE_GROUP_EVENTS.ACCEPTED,
      payload: { groupId: 'g1', tenantId: 't1', inspectorId: 'i1' },
      occurredAt,
    });

    expect(jobQueue.enqueue).toHaveBeenCalledTimes(2);
    const [name, payload, options] = jobQueue.enqueue.mock.calls[0]!;
    expect(name).toBe(FY_WEBHOOK_JOB);
    expect(payload).toMatchObject({
      event: 'inspector.accepted',
      timestamp: occurredAt.toISOString(),
      data: {
        appointmentId: 'a1',
        appointmentCode: 'INS-0001',
        inspector: { id: 'i1', name: 'Kez' },
      },
    });
    expect(options).toMatchObject({ retryLimit: 5, retryBackoff: true, singletonKey: 'fy-accepted:g1:a1' });
  });

  it('enqueues appointment.status_changed on transitions', async () => {
    const { bus, jobQueue } = setup();
    await bus.emit({
      type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
      payload: { appointmentId: 'a1', fromStatus: 'SCHEDULED', toStatus: 'DONE' },
      occurredAt,
    });

    expect(jobQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(jobQueue.enqueue.mock.calls[0]![1]).toMatchObject({
      event: 'appointment.status_changed',
      data: { appointmentId: 'a1', fromStatus: 'SCHEDULED', toStatus: 'DONE' },
    });
  });

  it('is a no-op while FY_WEBHOOK is unconfigured', async () => {
    const { bus, jobQueue, fyRepo } = setup(false);
    await bus.emit({ type: SERVICE_GROUP_EVENTS.ACCEPTED, payload: { groupId: 'g1' }, occurredAt });
    await bus.emit({
      type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
      payload: { appointmentId: 'a1', fromStatus: 'DRAFT', toStatus: 'SCHEDULED' },
      occurredAt,
    });
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
    expect(fyRepo.findGroupAcceptanceInfo).not.toHaveBeenCalled();
  });

  it('never throws into the event bus when enqueue fails', async () => {
    const bus = new DomainEventBus();
    const jobQueue = { enqueue: vi.fn(async () => { throw new Error('queue down'); }) };
    const fyRepo = { findGroupAcceptanceInfo: vi.fn(async () => []) };
    const logger = { warn: vi.fn() };
    new FyWebhookSubscriber(makeResolver(), fyRepo as any, jobQueue as any, logger).register(bus);

    await expect(
      bus.emit({
        type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
        payload: { appointmentId: 'a1', fromStatus: 'DRAFT', toStatus: 'SCHEDULED' },
        occurredAt,
      }),
    ).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('FyWebhookDispatcher', () => {
  const event = {
    event: 'appointment.status_changed' as const,
    timestamp: '2026-07-09T10:00:00.000Z',
    data: { appointmentId: 'a0000000-0000-4000-8000-000000000001', fromStatus: 'SCHEDULED' as const, toStatus: 'DONE' as const },
  };

  it('POSTs the event with the shared secret headers', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new FyWebhookDispatcher(makeResolver()).deliver(event);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://n8n.example/webhook');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-webhook-secret']).toBe('s3cret-s3cret');
    expect((init.headers as Record<string, string>)['x-fy-event']).toBe('appointment.status_changed');
    expect(JSON.parse(init.body as string)).toMatchObject({ event: 'appointment.status_changed' });
  });

  it('throws on non-2xx so pg-boss retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));
    await expect(new FyWebhookDispatcher(makeResolver()).deliver(event)).rejects.toThrow('HTTP 502');
  });

  it('drops silently when the integration got unconfigured after enqueue', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await new FyWebhookDispatcher(makeResolver(false)).deliver(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
