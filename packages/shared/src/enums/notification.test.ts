import { describe, it, expect } from 'vitest';
import { NotificationChannel, NotificationStatus } from './notification';

describe('NotificationChannel', () => {
  it('should have EMAIL, SMS, WHATSAPP values', () => {
    expect(NotificationChannel.EMAIL).toBe('EMAIL');
    expect(NotificationChannel.SMS).toBe('SMS');
    expect(NotificationChannel.WHATSAPP).toBe('WHATSAPP');
  });

  it('should have exactly 3 channels', () => {
    expect(Object.keys(NotificationChannel)).toHaveLength(3);
  });

  it('should not have PUSH channel', () => {
    expect('PUSH' in NotificationChannel).toBe(false);
  });

  it('should not have IN_APP channel', () => {
    expect('IN_APP' in NotificationChannel).toBe(false);
  });
});

describe('NotificationStatus', () => {
  it('should have PENDING, SENT, DELIVERED, FAILED, SKIPPED values', () => {
    expect(NotificationStatus.PENDING).toBe('PENDING');
    expect(NotificationStatus.SENT).toBe('SENT');
    expect(NotificationStatus.DELIVERED).toBe('DELIVERED');
    expect(NotificationStatus.FAILED).toBe('FAILED');
    expect(NotificationStatus.SKIPPED).toBe('SKIPPED');
  });

  it('should have exactly 5 statuses', () => {
    expect(Object.keys(NotificationStatus)).toHaveLength(5);
  });

  it('should not have QUEUED status', () => {
    expect('QUEUED' in NotificationStatus).toBe(false);
  });

  it('should not have BOUNCED status', () => {
    expect('BOUNCED' in NotificationStatus).toBe(false);
  });
});
