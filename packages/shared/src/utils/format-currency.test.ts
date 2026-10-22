import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency', () => {
  it('formats AUD with the dollar symbol and two decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('always shows two fraction digits, even on whole amounts', () => {
    expect(formatCurrency(10)).toBe('$10.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative amounts', () => {
    expect(formatCurrency(-5)).toBe('-$5.00');
  });

  it('defaults to AUD when no currency is given', () => {
    expect(formatCurrency(5)).toBe(formatCurrency(5, 'AUD'));
  });

  it('honours an explicit currency override', () => {
    const usd = formatCurrency(5, 'USD');
    expect(usd).toContain('5.00');
    // A foreign currency must render differently from the AUD default.
    expect(usd).not.toBe(formatCurrency(5, 'AUD'));
  });
});
