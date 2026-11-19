import { describe, it, expect } from 'vitest';
import {
  CancellationReasonCode,
  RejectionReasonCode,
  SYSTEM_ONLY_REJECTION_CODES,
  ORIGIN_RESTRICTED_REJECTION_CODES,
  allowedRejectionCodesFrom,
} from './reason-codes';

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

  it('has INSPECTOR_NO_SHOW and NOT_EXECUTED (F07-1 accountability codes)', () => {
    expect(RejectionReasonCode.INSPECTOR_NO_SHOW).toBe('INSPECTOR_NO_SHOW');
    expect(RejectionReasonCode.NOT_EXECUTED).toBe('NOT_EXECUTED');
  });

  // F07-1 added INSPECTOR_NO_SHOW and NOT_EXECUTED: 9 + 2 = 11.
  it('has exactly 11 codes', () => {
    expect(Object.keys(RejectionReasonCode)).toHaveLength(11);
  });
});

describe('SYSTEM_ONLY_REJECTION_CODES', () => {
  it('contains only INSPECTOR_UNABLE', () => {
    expect(SYSTEM_ONLY_REJECTION_CODES).toEqual([RejectionReasonCode.INSPECTOR_UNABLE]);
  });

  it('does not include the F07-1 operator codes', () => {
    expect(SYSTEM_ONLY_REJECTION_CODES).not.toContain(RejectionReasonCode.INSPECTOR_NO_SHOW);
    expect(SYSTEM_ONLY_REJECTION_CODES).not.toContain(RejectionReasonCode.NOT_EXECUTED);
  });
});

describe('ORIGIN_RESTRICTED_REJECTION_CODES', () => {
  it('is exactly the two F07-1 origin-restricted codes', () => {
    expect(ORIGIN_RESTRICTED_REJECTION_CODES).toEqual([
      RejectionReasonCode.INSPECTOR_NO_SHOW,
      RejectionReasonCode.NOT_EXECUTED,
    ]);
  });

  it('is disjoint from the system-only codes (they are operator codes, origin-gated)', () => {
    for (const code of ORIGIN_RESTRICTED_REJECTION_CODES) {
      expect(SYSTEM_ONLY_REJECTION_CODES).not.toContain(code);
    }
  });
});

describe('allowedRejectionCodesFrom (F07-1)', () => {
  it('allows INSPECTOR_NO_SHOW only from SCHEDULED', () => {
    expect(allowedRejectionCodesFrom('SCHEDULED')).toContain(RejectionReasonCode.INSPECTOR_NO_SHOW);
    expect(allowedRejectionCodesFrom('SCHEDULED')).not.toContain(RejectionReasonCode.NOT_EXECUTED);
  });

  it('allows NOT_EXECUTED only from DONE', () => {
    expect(allowedRejectionCodesFrom('DONE')).toContain(RejectionReasonCode.NOT_EXECUTED);
    expect(allowedRejectionCodesFrom('DONE')).not.toContain(RejectionReasonCode.INSPECTOR_NO_SHOW);
  });

  it('allows neither restricted code from DRAFT, AWAITING_INSPECTOR or REJECTED', () => {
    for (const from of ['DRAFT', 'AWAITING_INSPECTOR', 'REJECTED'] as const) {
      expect(allowedRejectionCodesFrom(from)).not.toContain(RejectionReasonCode.INSPECTOR_NO_SHOW);
      expect(allowedRejectionCodesFrom(from)).not.toContain(RejectionReasonCode.NOT_EXECUTED);
    }
  });

  it('keeps the general codes available from every origin', () => {
    for (const from of ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED', 'DONE', 'REJECTED'] as const) {
      expect(allowedRejectionCodesFrom(from)).toContain(RejectionReasonCode.OTHER);
      expect(allowedRejectionCodesFrom(from)).toContain(RejectionReasonCode.INVALID_ADDRESS);
    }
  });
});
