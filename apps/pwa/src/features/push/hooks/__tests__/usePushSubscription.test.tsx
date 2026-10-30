import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePushSubscription, type PushDeps } from '../usePushSubscription';

function fakeSub(key: ArrayBuffer | null, endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  return {
    endpoint,
    options: { applicationServerKey: key },
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function makeDeps(overrides: Partial<PushDeps> = {}): PushDeps {
  return {
    isIosSafariEligible: () => false,
    isStandalone: () => true,
    hasServiceWorker: () => true,
    hasPushManager: () => true,
    hasNotification: () => true,
    getPermission: () => 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
    vapidPublicKey: 'AQID', // bytes [1,2,3]
    vapidLoading: false,
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(fakeSub(new Uint8Array([1, 2, 3]).buffer)),
    saveSubscription: vi.fn().mockResolvedValue(undefined),
    removeSubscription: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function settle(deps: PushDeps) {
  const { result } = renderHook(() => usePushSubscription(deps));
  await waitFor(() => expect(result.current.state).not.toBe('loading'));
  return result;
}

describe('usePushSubscription — state precedence (L-F02-05)', () => {
  it('unsupported when PushManager is missing', async () => {
    const r = await settle(makeDeps({ hasPushManager: () => false }));
    expect(r.current.state).toBe('unsupported');
  });

  it('ios-needs-install before unsupported', async () => {
    const r = await settle(
      makeDeps({ isIosSafariEligible: () => true, isStandalone: () => false, hasPushManager: () => false }),
    );
    expect(r.current.state).toBe('ios-needs-install');
  });

  it('blocked before unavailable', async () => {
    const r = await settle(makeDeps({ getPermission: () => 'denied', vapidPublicKey: null }));
    expect(r.current.state).toBe('blocked');
  });

  it('unavailable when VAPID is null (not iOS, permission ok)', async () => {
    const r = await settle(makeDeps({ vapidPublicKey: null }));
    expect(r.current.state).toBe('unavailable');
  });

  it('unsupported when PushManager missing and VAPID null (not iOS)', async () => {
    const r = await settle(makeDeps({ hasPushManager: () => false, vapidPublicKey: null }));
    expect(r.current.state).toBe('unsupported');
  });

  it('off with no local subscription', async () => {
    const r = await settle(makeDeps());
    expect(r.current.state).toBe('off');
  });

  it('on with a local subscription', async () => {
    const r = await settle(makeDeps({ getSubscription: vi.fn().mockResolvedValue(fakeSub(new Uint8Array([1, 2, 3]).buffer)) }));
    expect(r.current.state).toBe('on');
  });
});

describe('usePushSubscription — enable/disable', () => {
  it('enables: subscribe + save → on', async () => {
    const deps = makeDeps({ getPermission: () => 'default', requestPermission: vi.fn().mockResolvedValue('granted') });
    const r = await settle(deps);
    await act(async () => { await r.current.enable(); });
    expect(deps.subscribe).toHaveBeenCalled();
    expect(deps.saveSubscription).toHaveBeenCalled();
    expect(r.current.state).toBe('on');
  });

  it('blocked when permission denied, no POST', async () => {
    const deps = makeDeps({ requestPermission: vi.fn().mockResolvedValue('denied') });
    const r = await settle(deps);
    await act(async () => { await r.current.enable(); });
    expect(r.current.state).toBe('blocked');
    expect(deps.saveSubscription).not.toHaveBeenCalled();
  });

  it('rolls back and reports save-failed when the POST fails', async () => {
    const sub = fakeSub(new Uint8Array([1, 2, 3]).buffer);
    const deps = makeDeps({
      requestPermission: vi.fn().mockResolvedValue('granted'),
      subscribe: vi.fn().mockResolvedValue(sub),
      saveSubscription: vi.fn().mockRejectedValue(new Error('500')),
    });
    const r = await settle(deps);
    await act(async () => { await r.current.enable(); });
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(r.current.state).toBe('off');
    expect(r.current.error).toBe('save-failed');
  });

  it('disables: POST unsubscribe then local unsubscribe → off', async () => {
    const sub = fakeSub(new Uint8Array([1, 2, 3]).buffer);
    const deps = makeDeps({ getSubscription: vi.fn().mockResolvedValue(sub) });
    const r = await settle(deps);
    await act(async () => { await r.current.disable(); });
    expect(deps.removeSubscription).toHaveBeenCalledWith(sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(r.current.state).toBe('off');
  });

  it('disables locally even when the POST fails (offline)', async () => {
    const sub = fakeSub(new Uint8Array([1, 2, 3]).buffer);
    const deps = makeDeps({
      getSubscription: vi.fn().mockResolvedValue(sub),
      removeSubscription: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const r = await settle(deps);
    await act(async () => { await r.current.disable(); });
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(r.current.state).toBe('off');
  });
});

describe('usePushSubscription — VAPID rotation (L-F02-04)', () => {
  it('re-subscribes with the new key when it changed and permission is granted', async () => {
    const stale = fakeSub(new Uint8Array([9, 9, 9]).buffer);
    const deps = makeDeps({
      getPermission: () => 'granted',
      getSubscription: vi.fn().mockResolvedValue(stale),
    });
    const r = await settle(deps);
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(deps.subscribe).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(deps.saveSubscription).toHaveBeenCalled();
    expect(r.current.state).toBe('on');
  });

  it('only unsubscribes locally when the key changed but permission is not granted', async () => {
    const stale = fakeSub(new Uint8Array([9, 9, 9]).buffer);
    const deps = makeDeps({
      getPermission: () => 'default',
      getSubscription: vi.fn().mockResolvedValue(stale),
    });
    const r = await settle(deps);
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
    expect(r.current.state).toBe('off');
  });

  it('leaves an equal key untouched', async () => {
    const sub = fakeSub(new Uint8Array([1, 2, 3]).buffer);
    const deps = makeDeps({ getPermission: () => 'granted', getSubscription: vi.fn().mockResolvedValue(sub) });
    const r = await settle(deps);
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
    expect(r.current.state).toBe('on');
  });

  it('reports save-failed if re-subscribe throws', async () => {
    const stale = fakeSub(new Uint8Array([9, 9, 9]).buffer);
    const deps = makeDeps({
      getPermission: () => 'granted',
      getSubscription: vi.fn().mockResolvedValue(stale),
      subscribe: vi.fn().mockRejectedValue(new Error('denied')),
    });
    const r = await settle(deps);
    expect(r.current.state).toBe('off');
    expect(r.current.error).toBe('save-failed');
  });
});
