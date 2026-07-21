import { describe, it, expect } from 'vitest';
import { PropertyCodeFormatter } from '../../../src/modules/property/domain/property-code.formatter';

describe('PropertyCodeFormatter', () => {
  it('formats prefix + PROP + zero-padded number', () => {
    expect(PropertyCodeFormatter.formatParts(1, 'ABC')).toBe('ABC-PROP-0001');
    expect(PropertyCodeFormatter.formatParts(42, 'AB12')).toBe('AB12-PROP-0042');
  });

  it('falls back to bare PROP code when tenant has no prefix', () => {
    expect(PropertyCodeFormatter.formatParts(7, null)).toBe('PROP-0007');
    expect(PropertyCodeFormatter.formatParts(7, undefined)).toBe('PROP-0007');
    expect(PropertyCodeFormatter.formatParts(7, '')).toBe('PROP-0007');
  });

  it('does not truncate numbers beyond 4 digits', () => {
    expect(PropertyCodeFormatter.formatParts(12345, 'ABC')).toBe('ABC-PROP-12345');
  });
});
