import { afterEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

import { WebPushSender } from '../../../src/modules/inspector-notice/infrastructure/web-push.sender';

const VAPID = { subject: 'mailto:ops@example.com', publicKey: 'PUB', privateKey: 'PRIV' };
const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'P', auth: 'A' };
const payload = { v: 1 as const, noticeId: 'n1', title: 'T', body: 'B', critical: true, url: '/profile/announcements/n1' };
const opts = { ttlSeconds: 86400, urgency: 'high' as const };

function sender() {
  return new WebPushSender(VAPID);
}

afterEach(() => sendNotification.mockReset());

describe('WebPushSender', () => {
  it('is enabled', () => {
    expect(sender().isEnabled()).toBe(true);
  });

  it('returns SENT on success and calls the lib with the right shape', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const out = await sender().send(target, payload, opts);
    expect(out).toEqual({ outcome: 'SENT' });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: 'P', auth: 'A' } },
      JSON.stringify(payload),
      {
        TTL: 86400,
        urgency: 'high',
        timeout: 10000,
        vapidDetails: { subject: VAPID.subject, publicKey: 'PUB', privateKey: 'PRIV' },
      },
    );
  });

  it.each([404, 410] as const)('maps %i to GONE', async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));
    expect(await sender().send(target, payload, opts)).toEqual({ outcome: 'GONE', statusCode });
  });

  it.each([401, 403] as const)('maps %i to REJECTED', async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error('rejected'), { statusCode }));
    expect(await sender().send(target, payload, opts)).toEqual({ outcome: 'REJECTED', statusCode });
  });

  it.each([400, 413, 429, 500] as const)('maps %i to FAILED', async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error('fail'), { statusCode }));
    expect(await sender().send(target, payload, opts)).toEqual({ outcome: 'FAILED', statusCode });
  });

  it('maps a network error (no statusCode) to FAILED with null', async () => {
    sendNotification.mockRejectedValue(new Error('ECONNRESET'));
    expect(await sender().send(target, payload, opts)).toEqual({ outcome: 'FAILED', statusCode: null });
  });

  it('refuses a non-allowlisted endpoint without making a request (SSRF guard)', async () => {
    const res = await sender().send({ endpoint: 'https://internal.local/x', p256dh: 'P', auth: 'A' }, payload, opts);
    expect(res).toEqual({ outcome: 'FAILED', statusCode: null });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
