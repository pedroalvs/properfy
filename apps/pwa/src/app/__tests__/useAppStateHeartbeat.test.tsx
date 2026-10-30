import { renderHook, waitFor } from '@testing-library/react';
import { useAppStateHeartbeat, APP_STATE_HEARTBEAT_KEY, type AppStateHeartbeatDeps } from '../useAppStateHeartbeat';

const SIX_HOURS = 6 * 60 * 60 * 1000;

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void map.set(k, v)),
    removeItem: vi.fn((k: string) => void map.delete(k)),
    map,
  };
}

/** Flush the microtask queue so an async `doSend` settles. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function fireVisible() {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
}

function mount(deps: AppStateHeartbeatDeps) {
  return renderHook(() => useAppStateHeartbeat(deps));
}

const baseDeps = (over: Partial<AppStateHeartbeatDeps> = {}): AppStateHeartbeatDeps => ({
  send: vi.fn().mockResolvedValue({ status: 204 }),
  now: () => 1_000_000_000_000,
  getDisplayMode: () => 'browser',
  getPushPermission: () => 'default',
  appVersion: 'test',
  ...over,
});

describe('useAppStateHeartbeat', () => {
  afterEach(() => {
    setVisibility('visible');
    vi.clearAllMocks();
  });

  it('sends a beat on mount when storage is empty', async () => {
    const storage = makeStorage();
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith({ displayMode: 'browser', pushPermission: 'default', appVersion: 'test' });
    await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
  });

  it('does not send within 6h in the same mode', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage({
      [APP_STATE_HEARTBEAT_KEY]: JSON.stringify({ at: now - 60 * 60 * 1000, displayMode: 'browser' }),
    });
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send, now: () => now }));
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends once the throttle has expired', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage({
      [APP_STATE_HEARTBEAT_KEY]: JSON.stringify({ at: now - SIX_HOURS - 1, displayMode: 'browser' }),
    });
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send, now: () => now }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('sends immediately when the display mode changed', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage({
      [APP_STATE_HEARTBEAT_KEY]: JSON.stringify({ at: now - 60 * 60 * 1000, displayMode: 'browser' }),
    });
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send, now: () => now, getDisplayMode: () => 'standalone' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ displayMode: 'standalone' }));
  });

  it('sends on visibilitychange after the throttle expires', async () => {
    let now = 1_000_000_000_000;
    const storage = makeStorage({
      [APP_STATE_HEARTBEAT_KEY]: JSON.stringify({ at: now, displayMode: 'browser' }),
    });
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send, now: () => now }));
    await flush();
    expect(send).not.toHaveBeenCalled(); // throttled on mount
    now += 7 * 60 * 60 * 1000; // 7h later
    fireVisible();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('does not persist on a network error and retries on the next trigger', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage();
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send, now: () => now }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(storage.setItem).not.toHaveBeenCalled();
    fireVisible();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('persists on a 429 so it stops insisting', async () => {
    const storage = makeStorage();
    const send = vi.fn().mockResolvedValue({ status: 429 });
    mount(baseDeps({ storage, send }));
    await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
  });

  it('reports unsupported when Notification is absent', async () => {
    const hadNotification = 'Notification' in window;
    const original = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    try {
      const storage = makeStorage();
      const send = vi.fn().mockResolvedValue({ status: 204 });
      // Omit getPushPermission → exercise the real readPushPermission.
      mount({ storage, send, now: () => 1_000_000_000_000, getDisplayMode: () => 'browser', appVersion: 'test' });
      await waitFor(() => expect(send).toHaveBeenCalled());
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ pushPermission: 'unsupported' }));
    } finally {
      if (hadNotification) (window as { Notification?: unknown }).Notification = original;
    }
  });

  it('sends at most once per load when storage throws, without throwing', async () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const send = vi.fn().mockResolvedValue({ status: 204 });
    mount(baseDeps({ storage, send }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    fireVisible();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends on the next mount after the throttle key was cleared (logout)', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage({
      [APP_STATE_HEARTBEAT_KEY]: JSON.stringify({ at: now, displayMode: 'browser' }),
    });
    const send = vi.fn().mockResolvedValue({ status: 204 });
    const { unmount } = mount(baseDeps({ storage, send, now: () => now }));
    await flush();
    expect(send).not.toHaveBeenCalled();
    unmount();
    storage.map.delete(APP_STATE_HEARTBEAT_KEY); // logout clears the key
    mount(baseDeps({ storage, send, now: () => now }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('sends one beat per display-mode change on shared storage', async () => {
    const now = 1_000_000_000_000;
    const storage = makeStorage();
    const send = vi.fn().mockResolvedValue({ status: 204 });
    let mode: 'standalone' | 'browser' = 'standalone';
    mount(baseDeps({ storage, send, now: () => now, getDisplayMode: () => mode }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1)); // standalone
    mode = 'browser';
    fireVisible();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2)); // browser
    mode = 'standalone';
    fireVisible();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3)); // standalone again
  });
});
