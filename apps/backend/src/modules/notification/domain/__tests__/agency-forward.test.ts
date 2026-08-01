import { describe, expect, it } from 'vitest';
import { getAgencyForwardNotificationId } from '../agency-forward';

describe('getAgencyForwardNotificationId', () => {
  it('derives a stable UUID v5 for the source notification', () => {
    expect(getAgencyForwardNotificationId('notif-1')).toBe(
      '9a1d6ac5-ef86-517f-9e7a-dc2d96b3ddce',
    );
    expect(getAgencyForwardNotificationId('notif-1')).toBe(
      getAgencyForwardNotificationId('notif-1'),
    );
    expect(getAgencyForwardNotificationId('notif-1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('derives different IDs for different source notifications', () => {
    expect(getAgencyForwardNotificationId('notif-1')).not.toBe(
      getAgencyForwardNotificationId('notif-2'),
    );
  });
});
