import type { ApiKeyRole } from '@properfy/shared';

// Inbound machine-to-machine API keys (n8n / AI automations). The plaintext
// key exists only in the create response; at rest we keep its SHA-256 hash
// plus a display prefix. v1 ships the mechanism only — no business route is
// opted in yet.

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;
  role: ApiKeyRole;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdById: string;
  createdAt: Date;
}

export interface CreateApiKeyData {
  name: string;
  keyHash: string;
  prefix: string;
  role: ApiKeyRole;
  scopes: string[];
  expiresAt: Date | null;
  createdById: string;
}

export interface IApiKeyRepository {
  create(data: CreateApiKeyData): Promise<ApiKey>;
  list(): Promise<ApiKey[]>;
  findById(id: string): Promise<ApiKey | null>;
  findByHash(keyHash: string): Promise<ApiKey | null>;
  revoke(id: string): Promise<void>;
  /** Fire-and-forget freshness marker; throttled by the caller. */
  touchLastUsed(id: string, at: Date): Promise<void>;
}

export function isApiKeyUsable(key: ApiKey, now: Date): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
