import { describe, it, expect } from 'vitest';
import { CancellationReasonCode, RejectionReasonCode } from './reason-codes';

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

  it('has exactly 8 codes', () => {
    expect(Object.keys(RejectionReasonCode)).toHaveLength(8);
  });
});
