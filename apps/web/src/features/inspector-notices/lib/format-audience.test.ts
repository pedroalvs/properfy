import { describe, it, expect } from 'vitest';
import type { InspectorNoticeAudience } from '@properfy/shared';
import { formatAudience } from './format-audience';

describe('formatAudience', () => {
  it('ALL → "All active inspectors"', () => {
    expect(formatAudience({ type: 'ALL' })).toBe('All active inspectors');
  });

  it('SELECTED → "N selected inspectors"', () => {
    const audience: InspectorNoticeAudience = { type: 'SELECTED', inspectorIds: ['a', 'b', 'c'] };
    expect(formatAudience(audience)).toBe('3 selected inspectors');
  });

  it('SELECTED with one id is singular', () => {
    expect(formatAudience({ type: 'SELECTED', inspectorIds: ['a'] })).toBe('1 selected inspector');
  });

  it('REGION → "Region: {name}"', () => {
    const audience: InspectorNoticeAudience = { type: 'REGION', regionId: 'r1', regionName: 'North Shore' };
    expect(formatAudience(audience)).toBe('Region: North Shore');
  });

  it('SYSTEM → "Automatic"', () => {
    const audience: InspectorNoticeAudience = { type: 'SYSTEM', systemType: 'ROUTE_PUBLISHED' };
    expect(formatAudience(audience)).toBe('Automatic');
  });
});
