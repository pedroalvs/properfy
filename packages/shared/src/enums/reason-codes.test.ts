import { describe, it, expect } from 'vitest';
import { CancellationReasonCode, RejectionReasonCode, SYSTEM_ONLY_REJECTION_CODES } from './reason-codes';

describe('CancellationReasonCode', () => {
  it('has expected codes', () => {
    expect(CancellationReasonCode.CLIENT_REQUEST).toBe('CLIENT_REQUEST');
    expect(CancellationReasonCode.TENANT_UNAVAILABLE).toBe('TENANT_UNAVAILABLE');
    expect(CancellationReasonCode.SCHEDULING_CONFLICT).toBe('SCHEDULING_CONFLICT');
    expect(CancellationReasonCode.INSPECTOR_UNAVAILABLE).toBe('INSPECTOR_UNAVAILABLE');
    expect(CancellationReasonCode.DUPLICATE).toBe('DUPLICATE');
    expect(CancellationReasonCode.OTHER).toBe('OTHER');
  });

  it('has EXPIRED for appointments auto-cancelled after their date passed', () => {
    expect(CancellationReasonCode.EXPIRED).toBe('EXPIRED');
  });

  it('has exactly 7 codes', () => {
    expect(Object.keys(CancellationReasonCode)).toHaveLength(7);
  });
});

describe('RejectionReasonCode', () => {
  it('has expected codes', () => {
    expect(RejectionReasonCode.INVALID_ADDRESS).toBe('INVALID_ADDRESS');
    expect(RejectionReasonCode.PROPERTY_INACCESSIBLE).toBe('PROPERTY_INACCESSIBLE');
    expect(RejectionReasonCode.SAFETY_CONCERN).toBe('SAFETY_CONCERN');
    expect(RejectionReasonCode.INSUFFICIENT_INFO).toBe('INSUFFICIENT_INFO');
    expect(RejectionReasonCode.SERVICE_NOT_AVAILABLE).toBe('SERVICE_NOT_AVAILABLE');
    expect(RejectionReasonCode.TENANT_NO_RESPONSE).toBe('TENANT_NO_RESPONSE');
    expect(RejectionReasonCode.OTHER).toBe('OTHER');
  });

  it('has TENANT_DECLINED, distinct from TENANT_NO_RESPONSE', () => {
    // A rental tenant who answered "No" in the portal and a rental tenant who
    // never answered at all are different outcomes: the first one leaves weekly
    // availability behind to reschedule against, the second leaves nothing.
    expect(RejectionReasonCode.TENANT_DECLINED).toBe('TENANT_DECLINED');
    expect(RejectionReasonCode.TENANT_DECLINED).not.toBe(RejectionReasonCode.TENANT_NO_RESPONSE);
  });

  it('has INSPECTOR_UNABLE, assigned by the system only', () => {
    expect(RejectionReasonCode.INSPECTOR_UNABLE).toBe('INSPECTOR_UNABLE');
  });

  // TASK-F07-1 raises this to 11 (INSPECTOR_NO_SHOW, NOT_EXECUTED). Keep this
  // assertion scoped to "exactly 9" here; do not depend on the list being
  // closed beyond this count.
  it('has exactly 9 codes', () => {
    expect(Object.keys(RejectionReasonCode)).toHaveLength(9);
  });
});

describe('SYSTEM_ONLY_REJECTION_CODES', () => {
  it('contains only INSPECTOR_UNABLE', () => {
    expect(SYSTEM_ONLY_REJECTION_CODES).toEqual([RejectionReasonCode.INSPECTOR_UNABLE]);
  });
});
