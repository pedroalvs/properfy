import {
  generateIdempotencyKey,
  getOrCreateIdempotencyKey,
  getIdempotencyKey,
  clearIdempotencyKey,
} from '../idempotency';

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

  describe('getIdempotencyKey', () => {
    it('returns null for non-existent action', () => {
      expect(getIdempotencyKey('nonexistent')).toBeNull();
    });

    it('returns the stored key for an existing action', () => {
      const created = getOrCreateIdempotencyKey('test-action');
      expect(getIdempotencyKey('test-action')).toBe(created);
    });
  });

  describe('clearIdempotencyKey', () => {
    it('removes the stored key', () => {
      getOrCreateIdempotencyKey('test-action');
      clearIdempotencyKey('test-action');
      expect(getIdempotencyKey('test-action')).toBeNull();
    });

    it('does not throw when clearing non-existent key', () => {
      expect(() => clearIdempotencyKey('nonexistent')).not.toThrow();
    });
  });
});
