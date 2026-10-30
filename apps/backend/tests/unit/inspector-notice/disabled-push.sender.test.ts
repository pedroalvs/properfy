import { describe, expect, it } from 'vitest';
import { DisabledPushSender } from '../../../src/modules/inspector-notice/infrastructure/disabled-push.sender';

describe('DisabledPushSender', () => {
  it('is disabled and always returns DISABLED', async () => {
    const sender = new DisabledPushSender();
    expect(sender.isEnabled()).toBe(false);
    expect(
      await sender.send(
        { endpoint: 'https://x/y', p256dh: 'P', auth: 'A' },
        { v: 1, noticeId: 'n1', title: 'T', body: 'B', critical: false, url: '/profile/announcements/n1' },
        { ttlSeconds: 86400, urgency: 'normal' },
      ),
    ).toEqual({ outcome: 'DISABLED' });
  });
});
