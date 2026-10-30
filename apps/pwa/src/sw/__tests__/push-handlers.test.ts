import { describe, it, expect, vi } from 'vitest';
import {
  buildNotification,
  resolveClickTarget,
  handleSubscriptionChange,
  type PushSubscriptionChangeEvent,
} from '../push-handlers';

const UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

describe('buildNotification', () => {
  it('builds a critical notification from a valid payload', () => {
    const out = buildNotification(
      JSON.stringify({
        v: 1,
        noticeId: 'n1',
        title: 'T',
        body: 'B',
        critical: true,
        url: '/profile/announcements/n1',
      }),
    );
    expect(out).toEqual({
      title: 'T',
      options: {
        body: 'B',
        tag: 'notice-n1',
        data: { url: '/profile/announcements/n1' },
        requireInteraction: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      },
    });
  });

  it('sets requireInteraction false for a non-critical payload', () => {
    const out = buildNotification(
      JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: false, url: '/profile/announcements/n1' }),
    );
    expect(out.options.requireInteraction).toBe(false);
  });

  it('falls back to a generic notification for an invalid/empty/non-JSON payload', () => {
    const fallback = {
      title: 'Properfy',
      options: { body: 'You have a new announcement.', tag: 'notice', data: { url: '/profile/announcements' } },
    };
    expect(buildNotification(null)).toEqual(fallback);
    expect(buildNotification('')).toEqual(fallback);
    expect(buildNotification('not json')).toEqual(fallback);
    expect(buildNotification(JSON.stringify({ v: 1 }))).toEqual(fallback);
  });

  it('drops an external url back to the inbox', () => {
    const out = buildNotification(
      JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: true, url: 'https://evil.example/x' }),
    );
    expect(out.options.data.url).toBe('/profile/announcements');
  });

  it('drops a non-allowlisted url back to the inbox', () => {
    for (const url of ['/schedule', '/today', '/earnings']) {
      const out = buildNotification(
        JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: true, url }),
      );
      expect(out.options.data.url).toBe('/profile/announcements');
    }
  });

  it('appends fromNotice for an allowlisted system target that is not the notice page', () => {
    const out = buildNotification(
      JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: true, url: `/schedule/${UUID}` }),
    );
    expect(out.options.data.url).toBe(`/schedule/${UUID}?fromNotice=n1`);
  });

  it('does not append fromNotice when the target is the notice page itself', () => {
    const out = buildNotification(
      JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: true, url: '/profile/announcements/n1' }),
    );
    expect(out.options.data.url).toBe('/profile/announcements/n1');
  });

  it('rejects near-valid urls without local normalization (L-F02-08)', () => {
    for (const url of [`/schedule/${UUID}/`, `/schedule/${UUID.toUpperCase()}`, '/schedule/%2e%2e']) {
      const out = buildNotification(
        JSON.stringify({ v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: true, url }),
      );
      expect(out.options.data.url).toBe('/profile/announcements');
    }
  });
});

describe('resolveClickTarget', () => {
  function makeSw(clients: Array<{ url: string; focus: ReturnType<typeof vi.fn>; navigate?: ReturnType<typeof vi.fn>; postMessage?: ReturnType<typeof vi.fn> }>) {
    return {
      clients: {
        matchAll: vi.fn().mockResolvedValue(clients),
        openWindow: vi.fn().mockResolvedValue(null),
      },
    } as any;
  }

  it('focuses and navigates an existing same-origin client', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const sw = makeSw([{ url: 'https://app.properfy.test/schedule', focus, navigate }]);
    await resolveClickTarget(sw, '/profile/announcements/n1');
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/profile/announcements/n1');
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it('posts a navigate message when the client cannot navigate', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const sw = makeSw([{ url: 'https://app.properfy.test/schedule', focus, postMessage }]);
    await resolveClickTarget(sw, '/profile/announcements/n1');
    expect(focus).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'navigate', url: '/profile/announcements/n1' });
  });

  it('opens a new window when there is no client', async () => {
    const sw = makeSw([]);
    await resolveClickTarget(sw, '/profile/announcements/n1');
    expect(sw.clients.openWindow).toHaveBeenCalledWith('/profile/announcements/n1');
  });
});

describe('handleSubscriptionChange', () => {
  function makeSw(subscribe: ReturnType<typeof vi.fn>, windows: Array<{ postMessage: ReturnType<typeof vi.fn> }>) {
    return {
      registration: { pushManager: { subscribe } },
      clients: { matchAll: vi.fn().mockResolvedValue(windows) },
    } as any;
  }

  it('messages windows without re-subscribing when newSubscription is present', async () => {
    const subscribe = vi.fn();
    const postMessage = vi.fn();
    const sw = makeSw(subscribe, [{ postMessage }]);
    const event = { newSubscription: {} } as unknown as PushSubscriptionChangeEvent;
    await handleSubscriptionChange(sw, event);
    expect(subscribe).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'push-subscription-changed' });
  });

  it('re-subscribes with the old key then messages windows', async () => {
    const subscribe = vi.fn().mockResolvedValue({});
    const postMessage = vi.fn();
    const sw = makeSw(subscribe, [{ postMessage }]);
    const key = new Uint8Array([1, 2, 3]).buffer;
    const event = { oldSubscription: { options: { applicationServerKey: key } } } as unknown as PushSubscriptionChangeEvent;
    await handleSubscriptionChange(sw, event);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
    expect(postMessage).toHaveBeenCalledWith({ type: 'push-subscription-changed' });
  });

  it('still messages windows when re-subscribe throws', async () => {
    const subscribe = vi.fn().mockRejectedValue(new Error('denied'));
    const postMessage = vi.fn();
    const sw = makeSw(subscribe, [{ postMessage }]);
    const key = new Uint8Array([9]).buffer;
    const event = { oldSubscription: { options: { applicationServerKey: key } } } as unknown as PushSubscriptionChangeEvent;
    await handleSubscriptionChange(sw, event);
    expect(postMessage).toHaveBeenCalledWith({ type: 'push-subscription-changed' });
  });
});
