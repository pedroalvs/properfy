import { describe, expect, it } from 'vitest';

import { getAgencyForwardNotificationId } from '../../../src/modules/notification/domain/agency-forward';
import { getTenantEtaNotificationId } from '../../../src/modules/tenant-eta/domain/tenant-eta-notification-id';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('getTenantEtaNotificationId', () => {
  const base = { kind: 'DELAY' as const, appointmentId: 'a1', scheduledDate: '2026-11-05', channel: 'SMS' as const };

  it('is a stable UUID v5 and pinned to a fixed value (protects the namespace)', () => {
    const id = getTenantEtaNotificationId(base);
    expect(id).toMatch(UUID_V5);
    expect(getTenantEtaNotificationId(base)).toBe(id);
    expect(id).toBe('d80dece5-f609-5f43-a437-ea7c326a176a');
  });

  it('changes when any component changes', () => {
    const id = getTenantEtaNotificationId(base);
    expect(getTenantEtaNotificationId({ ...base, kind: 'MORNING' })).not.toBe(id);
    expect(getTenantEtaNotificationId({ ...base, appointmentId: 'a2' })).not.toBe(id);
    expect(getTenantEtaNotificationId({ ...base, scheduledDate: '2026-11-06' })).not.toBe(id);
    expect(getTenantEtaNotificationId({ ...base, channel: 'EMAIL' })).not.toBe(id);
  });

  it('uses a different namespace than agency-forward', () => {
    expect(getTenantEtaNotificationId(base)).not.toBe(getAgencyForwardNotificationId('a1'));
  });
});
