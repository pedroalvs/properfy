import { createHash } from 'node:crypto';

/**
 * Deterministic hash of a command's idempotency-relevant payload, used by the
 * atomic `tryAcquire`/`complete`/`release` flow to detect "same key, different
 * payload" — mirrors the `sha256(JSON.stringify(...))` helper in
 * `set-rental-tenant-availability.use-case.ts`.
 */
export function hashIdempotencyPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
