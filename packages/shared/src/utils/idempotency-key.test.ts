import { describe, it, expect } from 'vitest';
import { createIdempotencyKeyManager, generateIdempotencyKey } from './idempotency-key';

describe('generateIdempotencyKey', () => {
  it('produces a UUID-shaped string', () => {
    expect(generateIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('produces a distinct key on each call', () => {
    expect(generateIdempotencyKey()).not.toBe(generateIdempotencyKey());
  });
});

describe('createIdempotencyKeyManager', () => {
  it('keeps the same key stable across repeated reads (safe to retry one operation)', () => {
    const manager = createIdempotencyKeyManager();
    const first = manager.current();
    expect(manager.current()).toBe(first);
    expect(manager.current()).toBe(first);
  });

  it('issues a fresh key on rotate so the next operation is deduped independently', () => {
    const manager = createIdempotencyKeyManager();
    const before = manager.current();
    const rotated = manager.rotate();
    expect(rotated).not.toBe(before);
    expect(manager.current()).toBe(rotated);
  });

  it('does NOT key by action name — two managers for the same operation differ', () => {
    // Guards against the HOL-9 pitfall: an action-name-keyed helper would 409
    // on two legitimate consecutive operations (e.g. two refunds).
    expect(createIdempotencyKeyManager().current()).not.toBe(
      createIdempotencyKeyManager().current(),
    );
  });

  it('accepts an injected generator for deterministic use', () => {
    let n = 0;
    const manager = createIdempotencyKeyManager(() => `key-${n++}`);
    expect(manager.current()).toBe('key-0');
    expect(manager.current()).toBe('key-0');
    expect(manager.rotate()).toBe('key-1');
    expect(manager.current()).toBe('key-1');
  });
});
