import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePushSubscriptionSync, type PushSyncDeps } from '../usePushSubscriptionSync';

function fakeSub(key: ArrayBuffer | null) {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    options: { applicationServerKey: key },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }),
  } as unknown as PushSubscription;
}

function makeDeps(overrides: Partial<PushSyncDeps> = {}): PushSyncDeps {
  return {
    hasServiceWorker: () => true,
    hasPushManager: () => true,
    hasNotification: () => true,
    getPermission: () => 'granted',
    vapidPublicKey: 'AQID', // bytes [1,2,3]
    getSubscription: vi.fn().mockResolvedValue(fakeSub(new Uint8Array([1, 2, 3]).buffer)),
    subscribe: vi.fn().mockResolvedValue(fakeSub(new Uint8Array([1, 2, 3]).buffer)),
    saveSubscription: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

class FakeSW extends EventTarget {}
function setSW(sw: EventTarget | undefined) {
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
}

describe('usePushSubscriptionSync', () => {
  afterEach(() => setSW(undefined));

  it('POSTs the current subscription on an authenticated load', async () => {
    const deps = makeDeps();
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(1));
  });

  it('does not POST when there is no local subscription', async () => {
    const deps = makeDeps({ getSubscription: vi.fn().mockResolvedValue(null) });
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.saveSubscription).not.toHaveBeenCalled();
  });

  it('does not POST without granted permission or support', async () => {
    const denied = makeDeps({ getPermission: () => 'default' });
    renderHook(() => usePushSubscriptionSync('u1', denied));
    const unsupported = makeDeps({ hasPushManager: () => false });
    renderHook(() => usePushSubscriptionSync('u2', unsupported));
    await new Promise((r) => setTimeout(r, 10));
    expect(denied.saveSubscription).not.toHaveBeenCalled();
    expect(unsupported.saveSubscription).not.toHaveBeenCalled();
  });

  it('POSTs at most once per load per userId', async () => {
    const deps = makeDeps();
    const { rerender } = renderHook(({ id }) => usePushSubscriptionSync(id, deps), {
      initialProps: { id: 'u1' },
    });
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(1));
    rerender({ id: 'u1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.saveSubscription).toHaveBeenCalledTimes(1);
  });

  it('POSTs again when the user changes', async () => {
    const deps = makeDeps();
    const { rerender } = renderHook(({ id }) => usePushSubscriptionSync(id, deps), {
      initialProps: { id: 'u1' },
    });
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(1));
    rerender({ id: 'u2' });
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(2));
  });

  it('resyncs on a push-subscription-changed service-worker message', async () => {
    const sw = new FakeSW();
    setSW(sw);
    const deps = makeDeps();
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(1));
    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'push-subscription-changed' } }));
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledTimes(2));
  });

  it('swallows a failing POST', async () => {
    const deps = makeDeps({ saveSubscription: vi.fn().mockRejectedValue(new Error('429')) });
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalled());
  });

  it('re-subscribes with the new server key when it rotated (L-F02-04)', async () => {
    const stale = fakeSub(new Uint8Array([9, 9, 9]).buffer);
    const fresh = fakeSub(new Uint8Array([1, 2, 3]).buffer);
    const deps = makeDeps({
      getSubscription: vi.fn().mockResolvedValue(stale),
      subscribe: vi.fn().mockResolvedValue(fresh),
    });
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await waitFor(() => expect(deps.subscribe).toHaveBeenCalledWith(new Uint8Array([1, 2, 3])));
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(deps.saveSubscription).toHaveBeenCalledWith(fresh);
  });

  it('falls back to POSTing the current subscription when the config has no key', async () => {
    const stale = fakeSub(new Uint8Array([9, 9, 9]).buffer);
    const deps = makeDeps({ vapidPublicKey: null, getSubscription: vi.fn().mockResolvedValue(stale) });
    renderHook(() => usePushSubscriptionSync('u1', deps));
    await waitFor(() => expect(deps.saveSubscription).toHaveBeenCalledWith(stale));
    expect(deps.subscribe).not.toHaveBeenCalled();
  });
});
