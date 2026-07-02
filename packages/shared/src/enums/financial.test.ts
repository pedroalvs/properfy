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
  it('should have PENDING, APPROVED, CANCELLED, VOIDED values', () => {
    expect(FinancialEntryStatus.PENDING).toBe('PENDING');
    expect(FinancialEntryStatus.APPROVED).toBe('APPROVED');
    expect(FinancialEntryStatus.CANCELLED).toBe('CANCELLED');
    expect(FinancialEntryStatus.VOIDED).toBe('VOIDED');
  });

  it('should have exactly 4 values', () => {
    expect(Object.keys(FinancialEntryStatus)).toHaveLength(4);
  });
});

describe('BillingPeriodType', () => {
  it('should have WEEKLY, FORTNIGHTLY, MONTHLY values', () => {
    expect(BillingPeriodType.WEEKLY).toBe('WEEKLY');
    expect(BillingPeriodType.FORTNIGHTLY).toBe('FORTNIGHTLY');
    expect(BillingPeriodType.MONTHLY).toBe('MONTHLY');
  });

  it('should have exactly 3 values', () => {
    expect(Object.keys(BillingPeriodType)).toHaveLength(3);
  });
});

describe('InspectorInvoiceStatus', () => {
  it('should have PENDING_REVIEW, OPEN, CLOSED, PAID, SUPERSEDED, VOID values', () => {
    expect(InspectorInvoiceStatus.PENDING_REVIEW).toBe('PENDING_REVIEW');
    expect(InspectorInvoiceStatus.OPEN).toBe('OPEN');
    expect(InspectorInvoiceStatus.CLOSED).toBe('CLOSED');
    expect(InspectorInvoiceStatus.PAID).toBe('PAID');
    expect(InspectorInvoiceStatus.SUPERSEDED).toBe('SUPERSEDED');
    expect(InspectorInvoiceStatus.VOID).toBe('VOID');
  });

  it('should have exactly 6 values', () => {
    expect(Object.keys(InspectorInvoiceStatus)).toHaveLength(6);
  });
});
