import { describe, it, expect } from 'vitest';
import { normalizeClUserPermissions } from '../../../src/shared/domain/cl-user-permissions';

describe('normalizeClUserPermissions', () => {
  it('returns a clean string[] for a valid array', () => {
    expect(normalizeClUserPermissions(['view_financials', 'create_appointments'])).toEqual([
      'view_financials',
      'create_appointments',
    ]);
  });

  it('drops non-string elements', () => {
    expect(normalizeClUserPermissions([123, 'view_financials', null, {}, 'export_reports'])).toEqual([
      'view_financials',
      'export_reports',
    ]);
  });

  it.each([undefined, null, 'not-an-array', 42, { a: 1 }])(
    'returns [] for non-array input (%s)',
    (raw) => {
      expect(normalizeClUserPermissions(raw)).toEqual([]);
    },
  );
});
