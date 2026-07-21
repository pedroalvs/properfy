import type { ApiKeyResponse, ApiKeyRole, ApiKeyScope } from '@properfy/shared';

export const FY_SCOPE: ApiKeyScope = 'bot:fy';
/** Fy keys always act as Operator — fixed, not exposed in the UI. */
export const FY_KEY_ROLE: ApiKeyRole = 'OP';

/**
 * The UI only creates keys matching the fixed Fy contract (role `OP`, sole
 * `bot:fy` scope), but the backend still accepts other shapes — legacy
 * unscoped, multi-scope or non-OP keys may exist. Everything presented as
 * "Fy" must be filtered through this predicate, which enforces the full
 * contract, not just scope membership.
 */
export function isFyKey(key: ApiKeyResponse): boolean {
  return key.role === FY_KEY_ROLE && key.scopes.length === 1 && key.scopes[0] === FY_SCOPE;
}
