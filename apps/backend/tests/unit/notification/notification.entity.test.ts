import { describe, it, expect } from 'vitest';
import { NotificationEntity, type NotificationProps } from '../../../src/modules/notification/domain/notification.entity';

function makeNotification(overrides: Partial<NotificationProps> = {}): NotificationEntity {
  const now = new Date();
  const defaults: NotificationProps = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'tenant@example.com',
    channel: 'EMAIL',
    templateCode: 'INSPECTION_NOTICE',
    status: 'PENDING',
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { tenantName: 'John' },
    retryCount: 0,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationEntity({ ...defaults, ...overrides });
}

describe('NotificationEntity', () => {
  it('should create an entity with all props', () => {
    const now = new Date();
    const notification = makeNotification({
      sentAt: now,
      providerName: 'resend',
      providerMessageId: 'msg-123',
    });

    expect(notification.id).toBe('notif-1');
    expect(notification.tenantId).toBe('tenant-1');
    expect(notification.appointmentId).toBe('appt-1');
    expect(notification.recipient).toBe('tenant@example.com');
    expect(notification.channel).toBe('EMAIL');
    expect(notification.templateCode).toBe('INSPECTION_NOTICE');
    expect(notification.status).toBe('PENDING');
    expect(notification.providerName).toBe('resend');
    expect(notification.providerMessageId).toBe('msg-123');
    expect(notification.sentAt).toBe(now);
    expect(notification.deliveredAt).toBeNull();
    expect(notification.failedAt).toBeNull();
    expect(notification.failureReason).toBeNull();
    expect(notification.payloadJson).toEqual({ tenantName: 'John' });
    expect(notification.retryCount).toBe(0);
    expect(notification.nextRetryAt).toBeNull();
  });

  it('should allow null appointmentId', () => {
    const notification = makeNotification({ appointmentId: null });
    expect(notification.appointmentId).toBeNull();
  });

  describe('isPending()', () => {
    it('should return true when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.isPending()).toBe(true);
    });

    it('should return false when status is SENT', () => {
      const notification = makeNotification({ status: 'SENT' });
      expect(notification.isPending()).toBe(false);
    });

    it('should return false when status is FAILED', () => {
      const notification = makeNotification({ status: 'FAILED' });
      expect(notification.isPending()).toBe(false);
    });
  });

  describe('isFailed()', () => {
    it('should return true when status is FAILED', () => {
      const notification = makeNotification({ status: 'FAILED' });
      expect(notification.isFailed()).toBe(true);
    });

    it('should return false when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.isFailed()).toBe(false);
    });

    it('should return false when status is DELIVERED', () => {
      const notification = makeNotification({ status: 'DELIVERED' });
      expect(notification.isFailed()).toBe(false);
    });
  });

  describe('isSent()', () => {
    it('should return true when status is SENT', () => {
      const notification = makeNotification({ status: 'SENT' });
      expect(notification.isSent()).toBe(true);
    });

    it('should return false when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.isSent()).toBe(false);
    });

    it('should return false when status is FAILED', () => {
      const notification = makeNotification({ status: 'FAILED' });
      expect(notification.isSent()).toBe(false);
    });
  });

  describe('isDelivered()', () => {
    it('should return true when status is DELIVERED', () => {
      const notification = makeNotification({ status: 'DELIVERED' });
      expect(notification.isDelivered()).toBe(true);
    });

    it('should return false when status is SENT', () => {
      const notification = makeNotification({ status: 'SENT' });
      expect(notification.isDelivered()).toBe(false);
    });

    it('should return false when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.isDelivered()).toBe(false);
    });
  });

  describe('canBeRetried()', () => {
    it('should return true when status is FAILED', () => {
      const notification = makeNotification({ status: 'FAILED' });
      expect(notification.canBeRetried()).toBe(true);
    });

    it('should return false when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.canBeRetried()).toBe(false);
    });

    it('should return false when status is SENT', () => {
      const notification = makeNotification({ status: 'SENT' });
      expect(notification.canBeRetried()).toBe(false);
    });

    it('should return false when status is DELIVERED', () => {
      const notification = makeNotification({ status: 'DELIVERED' });
      expect(notification.canBeRetried()).toBe(false);
    });
  });

  describe('canBeSent()', () => {
    it('should return true when status is PENDING', () => {
      const notification = makeNotification({ status: 'PENDING' });
      expect(notification.canBeSent()).toBe(true);
    });

    it('should return false when status is SENT', () => {
      const notification = makeNotification({ status: 'SENT' });
      expect(notification.canBeSent()).toBe(false);
    });

    it('should return false when status is FAILED', () => {
      const notification = makeNotification({ status: 'FAILED' });
      expect(notification.canBeSent()).toBe(false);
    });

    it('should return false when status is DELIVERED', () => {
      const notification = makeNotification({ status: 'DELIVERED' });
      expect(notification.canBeSent()).toBe(false);
    });
  });
});
