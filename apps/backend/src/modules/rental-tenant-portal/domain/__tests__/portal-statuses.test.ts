import { describe, it, expect } from 'vitest';
import { isPortalChangeTimeBlocked } from '../portal-statuses';

describe('isPortalChangeTimeBlocked', () => {
  it('blocks change-time for an inspector-driven rejection (INSPECTOR_UNABLE)', () => {
    expect(
      isPortalChangeTimeBlocked({ status: 'REJECTED', rejectionReasonCode: 'INSPECTOR_UNABLE' }),
    ).toBe(true);
  });

  it('still allows change-time after a tenant decline (TENANT_DECLINED)', () => {
    expect(
      isPortalChangeTimeBlocked({ status: 'REJECTED', rejectionReasonCode: 'TENANT_DECLINED' }),
    ).toBe(false);
  });

  it('allows change-time for a rejection with no reason code', () => {
    expect(isPortalChangeTimeBlocked({ status: 'REJECTED', rejectionReasonCode: null })).toBe(false);
  });

  it('does not block a live SCHEDULED appointment that carries a stale INSPECTOR_UNABLE code', () => {
    // A re-offered job can still carry the old rejection code; only REJECTED blocks.
    expect(
      isPortalChangeTimeBlocked({ status: 'SCHEDULED', rejectionReasonCode: 'INSPECTOR_UNABLE' }),
    ).toBe(false);
  });

  it.each(['DONE', 'CANCELLED', 'DRAFT'])('blocks change-time for the dead status %s', (status) => {
    expect(isPortalChangeTimeBlocked({ status, rejectionReasonCode: null })).toBe(true);
  });
});
