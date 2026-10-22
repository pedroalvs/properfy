import { generateIdempotencyKey, getOrCreateIdempotencyKey } from '../idempotency';

describe('idempotency', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('generateIdempotencyKey', () => {
    it('generates a valid UUID', () => {
      const key = generateIdempotencyKey();
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('generates unique keys on each call', () => {
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('getOrCreateIdempotencyKey', () => {
    it('creates a new key for a new action', () => {
      const key = getOrCreateIdempotencyKey('start-inspection-123');
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns the same key for the same action', () => {
      const key1 = getOrCreateIdempotencyKey('start-inspection-123');
      const key2 = getOrCreateIdempotencyKey('start-inspection-123');
      expect(key1).toBe(key2);
    });

    it('returns different keys for different actions', () => {
      const key1 = getOrCreateIdempotencyKey('start-inspection-123');
      const key2 = getOrCreateIdempotencyKey('finish-inspection-123');
      expect(key1).not.toBe(key2);
    });
  });
});
