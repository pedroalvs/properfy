/**
 * Framework-agnostic idempotency-key helper, shared by web and PWA.
 *
 * It promotes the stable-ref pattern of `useFinancialEntrySave` (web): a single
 * key stays constant while one operation is in flight — so a retry after a lost
 * response dedupes against the first attempt — and is rotated only once that
 * operation has definitively succeeded, giving the next operation a fresh key.
 *
 * Deliberately NOT keyed by action name (the discarded PWA approach, HOL-9):
 * an action-name key would make two legitimate consecutive operations — e.g.
 * two refunds — collide and 409 on the second.
 *
 * Callers own where the manager lives. In React, hold it in a `useRef` so the
 * key survives re-renders; call `current()` for the request header and
 * `rotate()` in the success path.
 */

/** Generate a fresh RFC-4122 idempotency key. */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface IdempotencyKeyManager {
  /** The current key — stable across reads until `rotate()` is called. */
  current(): string;
  /** Issue and adopt a new key; returns it. Call only after a success. */
  rotate(): string;
}

/**
 * Create a manager holding one rotatable idempotency key.
 *
 * @param generate Key factory, injectable for deterministic tests. Defaults to
 *   {@link generateIdempotencyKey}.
 */
export function createIdempotencyKeyManager(
  generate: () => string = generateIdempotencyKey,
): IdempotencyKeyManager {
  let key = generate();
  return {
    current: () => key,
    rotate: () => {
      key = generate();
      return key;
    },
  };
}
