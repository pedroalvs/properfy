import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../../../shared/application/events/domain-event-bus';
import {
  RecomputeReliabilityOnSettingsChangeSubscriber,
  SETTINGS_RECOMPUTE_DELAY_SECONDS,
} from './recompute-reliability-on-settings-change.subscriber';

const T = new Date('2026-12-02T00:40:00.000Z');

function event(key: string): DomainEvent {
  return {
    type: 'platform_setting.updated.v1',
    payload: { key, before: {}, after: {}, actorId: 'am-1', occurredAt: T.toISOString() },
    occurredAt: T,
  };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
}

describe('RecomputeReliabilityOnSettingsChangeSubscriber', () => {
  it('enqueues a delayed SETTINGS_CHANGED recompute for reliabilityIndex, with no singletonKey', async () => {
    const enqueue = vi.fn<[string, Record<string, unknown>, Record<string, unknown>?], Promise<void>>(async () => {});
    const sub = new RecomputeReliabilityOnSettingsChangeSubscriber({ enqueue }, makeLogger());

    await sub.handle(event('reliabilityIndex'));

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [name, payload, options] = enqueue.mock.calls[0]!;
    expect(name).toBe('reliability.compute-snapshots');
    expect(payload).toEqual({ trigger: 'SETTINGS_CHANGED' });
    expect(options).toEqual({
      startAfter: new Date(T.getTime() + SETTINGS_RECOMPUTE_DELAY_SECONDS * 1000),
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 15,
    });
    expect(options).not.toHaveProperty('singletonKey');
  });

  it('ignores every other settings key', async () => {
    const enqueue = vi.fn(async () => {});
    const sub = new RecomputeReliabilityOnSettingsChangeSubscriber({ enqueue }, makeLogger());
    for (const key of ['fieldEvents', 'routeWeights', 'liveDayAlerts']) {
      await sub.handle(event(key));
    }
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('logs and does not throw when the enqueue fails', async () => {
    const enqueue = vi.fn(async () => {
      throw new Error('queue down');
    });
    const logger = makeLogger();
    const sub = new RecomputeReliabilityOnSettingsChangeSubscriber({ enqueue }, logger);
    await expect(sub.handle(event('reliabilityIndex'))).resolves.toBeUndefined();
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled();
  });
});
