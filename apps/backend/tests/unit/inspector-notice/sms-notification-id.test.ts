import { describe, expect, it } from 'vitest';
import { getInspectorNoticeSmsNotificationId } from '../../../src/modules/inspector-notice/domain/sms-notification-id';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('getInspectorNoticeSmsNotificationId', () => {
  it('is a well-formed v5 UUID', () => {
    expect(getInspectorNoticeSmsNotificationId('notice-1', 'insp-1')).toMatch(UUID_V5);
  });

  it('is deterministic for the same (notice, inspector) pair', () => {
    expect(getInspectorNoticeSmsNotificationId('notice-1', 'insp-1')).toBe(
      getInspectorNoticeSmsNotificationId('notice-1', 'insp-1'),
    );
  });

  it('differs by notice and by inspector', () => {
    const a = getInspectorNoticeSmsNotificationId('notice-1', 'insp-1');
    const b = getInspectorNoticeSmsNotificationId('notice-2', 'insp-1');
    const c = getInspectorNoticeSmsNotificationId('notice-1', 'insp-2');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('does not collide across the pair separator', () => {
    // `a:bc` vs `ab:c` must not hash to the same id.
    expect(getInspectorNoticeSmsNotificationId('a', 'bc')).not.toBe(
      getInspectorNoticeSmsNotificationId('ab', 'c'),
    );
  });
});
