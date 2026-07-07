import { z } from 'zod';

// Inbound machine-to-machine API keys (n8n / AI automations) managed by AM via
// the Integrations Hub. The plaintext key (`pfy_<random>`) is generated server
// side, returned exactly once on create, and stored as a SHA-256 hash. Callers
// authenticate with the `X-API-Key` header; the key acts as a machine principal
// with the configured role. v1 ships the mechanism only — no business route is
// opted in yet (empty allowlist).

export const API_KEY_PLAINTEXT_PREFIX = 'pfy_';

/** Roles an API key may act as. Defaults to OP (operational, cross-tenant). */
export const apiKeyRoleSchema = z.enum(['AM', 'OP']);
export type ApiKeyRole = z.infer<typeof apiKeyRoleSchema>;

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: apiKeyRoleSchema.default('OP'),
  /** ISO datetime after which the key is rejected. Null/omitted = no expiry. */
  expiresAt: z.string().datetime().nullable().optional(),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  role: apiKeyRoleSchema,
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;

/** Create response — the only moment the plaintext key is ever returned. */
export const apiKeyCreatedSchema = apiKeyResponseSchema.extend({
  key: z.string().startsWith(API_KEY_PLAINTEXT_PREFIX),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const apiKeyListSchema = z.object({
  apiKeys: z.array(apiKeyResponseSchema),
});
export type ApiKeyList = z.infer<typeof apiKeyListSchema>;
