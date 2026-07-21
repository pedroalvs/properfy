import type { ApiKeyResponse, ApiKeyRole, ApiKeyScope } from '@properfy/shared';

export const FY_SCOPE: ApiKeyScope = 'bot:fy';
/** Fy keys always act as Operator — fixed, not exposed in the UI. */
export const FY_KEY_ROLE: ApiKeyRole = 'OP';

/**
 * The UI only creates `bot:fy` keys, but the backend still accepts unscoped
 * keys — legacy/general keys may exist. Everything presented as "Fy" must be
 * filtered through this predicate.
 */
export function isFyKey(key: ApiKeyResponse): boolean {
  return key.scopes.includes(FY_SCOPE);
}
