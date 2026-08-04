import { describe, it, expect } from 'vitest';
import { formatReasonCodeLabel } from './reason-code-label';
import { CancellationReasonCode, RejectionReasonCode } from '../enums/reason-codes';

describe('formatReasonCodeLabel', () => {
  it('humanizes a multi-word code', () => {
    expect(formatReasonCodeLabel('CLIENT_REQUEST')).toBe('Client Request');
  });

  it('humanizes a single-word code', () => {
    expect(formatReasonCodeLabel('DUPLICATE')).toBe('Duplicate');
  });

  it('returns an empty string for null/undefined/empty', () => {
    expect(formatReasonCodeLabel(null)).toBe('');
    expect(formatReasonCodeLabel(undefined)).toBe('');
    expect(formatReasonCodeLabel('')).toBe('');
  });

  it('renders every known reason code without leaving SCREAMING_CASE behind', () => {
    const codes = [...Object.values(CancellationReasonCode), ...Object.values(RejectionReasonCode)];
    for (const code of codes) {
      const label = formatReasonCodeLabel(code);
      expect(label).not.toContain('_');
      expect(label).not.toBe('');
      expect(label[0]).toBe(label[0]!.toUpperCase());
    }
  });
});
