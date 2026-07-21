import type { ApiKeyResponse } from '@properfy/shared';

import type { ApiKey } from '../domain/api-key';

/** Read model — deliberately omits keyHash; the plaintext key never exists here. */
export function toApiKeyResponse(key: ApiKey): ApiKeyResponse {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    role: key.role,
    scopes: key.scopes,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}
