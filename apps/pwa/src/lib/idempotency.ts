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

export function getIdempotencyKey(action: string): string | null {
  return sessionStorage.getItem(`${STORAGE_PREFIX}${action}`);
}

export function clearIdempotencyKey(action: string): void {
  sessionStorage.removeItem(`${STORAGE_PREFIX}${action}`);
}
