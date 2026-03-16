import { describe, it, expect } from 'vitest';
import {
  FinancialEntryType,
  FinancialEntryStatus,
  BillingPeriodType,
  InspectorInvoiceStatus,
} from './financial';

describe('FinancialEntryType', () => {
  it('should have TENANT_DEBIT, INSPECTOR_PAYOUT, REFUND, MANUAL_ADJUSTMENT values', () => {
    expect(FinancialEntryType.TENANT_DEBIT).toBe('TENANT_DEBIT');
    expect(FinancialEntryType.INSPECTOR_PAYOUT).toBe('INSPECTOR_PAYOUT');
    expect(FinancialEntryType.REFUND).toBe('REFUND');
    expect(FinancialEntryType.MANUAL_ADJUSTMENT).toBe('MANUAL_ADJUSTMENT');
  });

  it('should have exactly 4 values', () => {
    expect(Object.keys(FinancialEntryType)).toHaveLength(4);
  });
});

describe('FinancialEntryStatus', () => {
  it('should have PENDING, APPROVED, CANCELLED values', () => {
    expect(FinancialEntryStatus.PENDING).toBe('PENDING');
    expect(FinancialEntryStatus.APPROVED).toBe('APPROVED');
    expect(FinancialEntryStatus.CANCELLED).toBe('CANCELLED');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(FinancialEntryStatus)).toHaveLength(3);
  });
});

describe('BillingPeriodType', () => {
  it('should have WEEKLY, BIWEEKLY, MONTHLY values', () => {
    expect(BillingPeriodType.WEEKLY).toBe('WEEKLY');
    expect(BillingPeriodType.BIWEEKLY).toBe('BIWEEKLY');
    expect(BillingPeriodType.MONTHLY).toBe('MONTHLY');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(BillingPeriodType)).toHaveLength(3);
  });
});

describe('InspectorInvoiceStatus', () => {
  it('should have OPEN, CLOSED, PAID values', () => {
    expect(InspectorInvoiceStatus.OPEN).toBe('OPEN');
    expect(InspectorInvoiceStatus.CLOSED).toBe('CLOSED');
    expect(InspectorInvoiceStatus.PAID).toBe('PAID');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(InspectorInvoiceStatus)).toHaveLength(3);
  });
});
