import { describe, it, expect } from 'vitest';
import { formatCivilDate, formatSydneyDateTime, formatSydneyTime } from '../format-date';

describe('formatCivilDate', () => {
  it('formats a plain YYYY-MM-DD string without timezone shifting', () => {
    expect(formatCivilDate('2026-03-18')).toBe('18/03/2026');
  });

  it('tolerates the legacy YYYY-MM-DDT00:00:00.000Z form without shifting a day', () => {
    // On devices behind UTC, parsing this as an instant would render 17/03.
    expect(formatCivilDate('2026-03-18T00:00:00.000Z')).toBe('18/03/2026');
  });
});

describe('formatSydneyDateTime', () => {
  it('renders a real UTC instant on the Sydney calendar day', () => {
    // 2026-01-14T23:00:00Z is 15 Jan 10:00 in Sydney (AEDT, UTC+11).
    const result = formatSydneyDateTime('2026-01-14T23:00:00.000Z');
    expect(result).toContain('15/01/2026');
    expect(result).toContain('10:00');
  });
});

describe('formatSydneyTime', () => {
  it('renders a real UTC instant as Sydney wall-clock time', () => {
    // 2026-01-15T00:00:00Z is 11:00 am in Sydney (AEDT, UTC+11).
    expect(formatSydneyTime('2026-01-15T00:00:00.000Z').toLowerCase()).toContain('11:00');
  });

  it('respects Sydney standard time outside daylight saving', () => {
    // 2026-06-15T00:00:00Z is 10:00 am in Sydney (AEST, UTC+10).
    expect(formatSydneyTime('2026-06-15T00:00:00.000Z').toLowerCase()).toContain('10:00');
  });
});
