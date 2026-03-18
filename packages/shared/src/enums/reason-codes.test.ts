import { describe, it, expect } from 'vitest';
import { CancellationReasonCode, RejectionReasonCode } from './reason-codes';

describe('CancellationReasonCode', () => {
  it('has expected codes', () => {
    expect(CancellationReasonCode.CLIENT_REQUEST).toBe('CLIENT_REQUEST');
    expect(CancellationReasonCode.TENANT_UNAVAILABLE).toBe('TENANT_UNAVAILABLE');
    expect(CancellationReasonCode.DUPLICATE).toBe('DUPLICATE');
    expect(CancellationReasonCode.SCHEDULING_CONFLICT).toBe('SCHEDULING_CONFLICT');
    expect(CancellationReasonCode.OTHER).toBe('OTHER');
  });

  it('has exactly 5 codes', () => {
    expect(Object.keys(CancellationReasonCode)).toHaveLength(5);
  });
});

describe('RejectionReasonCode', () => {
  it('has expected codes', () => {
    expect(RejectionReasonCode.INVALID_ADDRESS).toBe('INVALID_ADDRESS');
    expect(RejectionReasonCode.ACCESS_DENIED).toBe('ACCESS_DENIED');
    expect(RejectionReasonCode.UNSAFE_PROPERTY).toBe('UNSAFE_PROPERTY');
    expect(RejectionReasonCode.INCOMPLETE_DATA).toBe('INCOMPLETE_DATA');
    expect(RejectionReasonCode.OTHER).toBe('OTHER');
  });

  it('has exactly 5 codes', () => {
    expect(Object.keys(RejectionReasonCode)).toHaveLength(5);
  });
});
