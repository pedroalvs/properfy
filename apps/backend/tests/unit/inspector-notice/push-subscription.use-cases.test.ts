import { describe, expect, it, vi } from 'vitest';
import { GetPushConfigUseCase } from '../../../src/modules/inspector-notice/application/use-cases/get-push-config.use-case';
import { UpsertPushSubscriptionUseCase } from '../../../src/modules/inspector-notice/application/use-cases/upsert-push-subscription.use-case';
import { UnsubscribePushSubscriptionUseCase } from '../../../src/modules/inspector-notice/application/use-cases/unsubscribe-push-subscription.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');
const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } };

describe('GetPushConfigUseCase', () => {
  it('returns the configured public key', async () => {
    expect(await new GetPushConfigUseCase('BKEY').execute()).toEqual({ vapidPublicKey: 'BKEY' });
  });
  it('returns null when unconfigured', async () => {
    expect(await new GetPushConfigUseCase(null).execute()).toEqual({ vapidPublicKey: null });
  });
});

describe('UpsertPushSubscriptionUseCase', () => {
  it('upserts when push is enabled', async () => {
    const repo = { upsert: vi.fn(async () => undefined) } as any;
    const sender = { isEnabled: () => true } as any;
    await new UpsertPushSubscriptionUseCase(repo, sender, { now: () => NOW }).execute('i1', sub);
    expect(repo.upsert).toHaveBeenCalledWith({
      inspectorId: 'i1',
      endpoint: sub.endpoint,
      p256dh: 'P',
      auth: 'A',
      now: NOW,
    });
  });

  it('throws 503 PUSH_NOT_CONFIGURED when push is disabled, without touching the repo', async () => {
    const repo = { upsert: vi.fn() } as any;
    const sender = { isEnabled: () => false } as any;
    await expect(
      new UpsertPushSubscriptionUseCase(repo, sender, { now: () => NOW }).execute('i1', sub),
    ).rejects.toMatchObject({ code: 'PUSH_NOT_CONFIGURED', statusCode: 503 });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('UnsubscribePushSubscriptionUseCase', () => {
  it('delegates to the repository (idempotent no-op handled there)', async () => {
    const repo = { unsubscribeOwn: vi.fn(async () => undefined) } as any;
    await new UnsubscribePushSubscriptionUseCase(repo, { now: () => NOW }).execute('i1', { endpoint: sub.endpoint });
    expect(repo.unsubscribeOwn).toHaveBeenCalledWith('i1', sub.endpoint, NOW);
  });
});
