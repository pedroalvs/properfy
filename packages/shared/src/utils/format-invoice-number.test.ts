import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber, INVOICE_NUMBER_PREFIX } from './format-invoice-number';

describe('formatInvoiceNumber', () => {
  it('zero-pads to 6 digits with the PINV- prefix', () => {
    expect(formatInvoiceNumber(1)).toBe('PINV-000001');
    expect(formatInvoiceNumber(123)).toBe('PINV-000123');
    expect(formatInvoiceNumber(999999)).toBe('PINV-999999');
  });

  it('does not truncate numbers longer than the pad width', () => {
    expect(formatInvoiceNumber(1234567)).toBe('PINV-1234567');
  });

  it('returns null for unassigned numbers (PENDING_REVIEW / VOID invoices)', () => {
    expect(formatInvoiceNumber(null)).toBeNull();
    expect(formatInvoiceNumber(undefined)).toBeNull();
  });

  it('exposes the prefix constant', () => {
    expect(INVOICE_NUMBER_PREFIX).toBe('PINV-');
  });

  it('throws on invalid numbers (non-integer or below 1)', () => {
    expect(() => formatInvoiceNumber(0)).toThrow();
    expect(() => formatInvoiceNumber(-5)).toThrow();
    expect(() => formatInvoiceNumber(1.5)).toThrow();
  });
});
