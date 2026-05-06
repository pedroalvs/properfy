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

  it('has exactly 6 codes', () => {
    expect(Object.keys(CancellationReasonCode)).toHaveLength(6);
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

  it('has exactly 7 codes', () => {
    expect(Object.keys(RejectionReasonCode)).toHaveLength(7);
  });
});
