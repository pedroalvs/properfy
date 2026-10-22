const STORAGE_PREFIX = 'idempotency:';

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function getOrCreateIdempotencyKey(action: string): string {
  const storageKey = `${STORAGE_PREFIX}${action}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const key = generateIdempotencyKey();
  sessionStorage.setItem(storageKey, key);
  return key;
}
