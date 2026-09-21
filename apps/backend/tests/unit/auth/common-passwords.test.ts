import { describe, it, expect } from 'vitest';
import { COMMON_PASSWORDS } from '../../../src/modules/auth/application/constants/common-passwords';

describe('COMMON_PASSWORDS', () => {
  // WI-12: the source array literal was deduplicated. A `Set` can never expose
  // a duplicate at runtime (re-adding the same value is a no-op), so a
  // dedup-detecting assertion against the built Set is not observable here —
  // the meaningful net is membership: entries that used to appear twice in the
  // source must still be present (exactly once, trivially, since it's a Set).
  it('is a Set (duplicates collapse by construction)', () => {
    expect(COMMON_PASSWORDS).toBeInstanceOf(Set);
  });

  it.each(['trustno1', 'starwars', 'pepper', 'cheese'])(
    'contains the previously-duplicated entry %s',
    (entry) => {
      expect(COMMON_PASSWORDS.has(entry)).toBe(true);
    },
  );

  it('has no blank or whitespace-only entries', () => {
    for (const entry of COMMON_PASSWORDS) {
      expect(entry.trim().length).toBeGreaterThan(0);
    }
  });
});
