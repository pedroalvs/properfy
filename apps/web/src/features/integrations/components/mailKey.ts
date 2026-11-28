import type { ApiKeyResponse, ApiKeyRole, ApiKeyScope } from '@properfy/shared';

export const MAIL_SCOPE: ApiKeyScope = 'bot:mail';
/** Mail Bot keys always act as Operator — fixed, not exposed in the UI. */
export const MAIL_KEY_ROLE: ApiKeyRole = 'OP';

/**
 * A key belongs to the "Mail Bot - AutoLabs" integration when it matches the
 * full contract: role `OP` with the sole `bot:mail` scope. The backend may hold
 * other shapes (legacy or Fy keys); everything presented as a Mail Bot key is
 * filtered through this predicate.
 */
export function isMailKey(key: ApiKeyResponse): boolean {
  return key.role === MAIL_KEY_ROLE && key.scopes.length === 1 && key.scopes[0] === MAIL_SCOPE;
}
