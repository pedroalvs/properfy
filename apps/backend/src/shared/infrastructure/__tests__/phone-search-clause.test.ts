import { describe, it, expect } from 'vitest';
import { phoneColumnSearchClauses } from '../phone-search-clause';

describe('phoneColumnSearchClauses', () => {
  it('expands a full local number into canonical variant clauses', () => {
    const clauses = phoneColumnSearchClauses('snapshot_phone', '0412 345 678');
    expect(clauses).toContainEqual({ snapshot_phone: { contains: '+61412345678' } });
  });

  it('falls back to a raw substring clause for a short partial number', () => {
    // A dedicated contact field: "3456" is a phone fragment, so it must still
    // produce a phone clause even though it is below the expansion threshold.
    expect(phoneColumnSearchClauses('snapshot_phone', '3456')).toEqual([
      { snapshot_phone: { contains: '3456' } },
    ]);
  });

  it('produces no clause for a plain name (no digits)', () => {
    expect(phoneColumnSearchClauses('snapshot_phone', 'Jane Smith')).toEqual([]);
    expect(phoneColumnSearchClauses('primary_phone', '')).toEqual([]);
  });

  it('honours the requested field name', () => {
    const clauses = phoneColumnSearchClauses('primary_phone', '3456');
    expect(clauses).toEqual([{ primary_phone: { contains: '3456' } }]);
  });
});
