import { z } from 'zod';

// Platform-level outbound integrations managed by AM via the Integrations Hub.
// Credentials live encrypted in the database and override env vars; when neither
// is configured the backend degrades to stub providers and the dashboard shows
// a warning per missing integration. Secrets are write-only: PUT accepts them,
// GET returns masked values (last 4 chars) only.

export const IntegrationProvider = {
  RESEND: 'resend',
  MOBILE_MESSAGE: 'mobile_message',
  MAPBOX: 'mapbox',
  FY_WEBHOOK: 'fy_webhook',
} as const;
export type IntegrationProvider =
  (typeof IntegrationProvider)[keyof typeof IntegrationProvider];

export const integrationProviderSchema = z.enum([
  IntegrationProvider.RESEND,
  IntegrationProvider.MOBILE_MESSAGE,
  IntegrationProvider.MAPBOX,
  IntegrationProvider.FY_WEBHOOK,
]);

const secretSchema = z.string().trim().min(1).max(500);

// --- Per-provider config payloads (PUT /v1/integrations/:provider) ---
// On update, omitted secret fields preserve the stored value; the backend
// merges against the decrypted existing config before re-encrypting.

export const resendConfigSchema = z.object({
  apiKey: secretSchema.optional(),
  fromEmail: z.string().trim().email().max(320).optional(),
});
export type ResendConfigInput = z.infer<typeof resendConfigSchema>;

export const mobileMessageConfigSchema = z.object({
  apiKey: secretSchema.optional(),
  password: secretSchema.optional(),
  senderId: z.string().trim().min(1).max(50).optional(),
  webhookToken: secretSchema.optional(),
});
export type MobileMessageConfigInput = z.infer<typeof mobileMessageConfigSchema>;

export const mapboxConfigSchema = z.object({
  accessToken: secretSchema.optional(),
});
export type MapboxConfigInput = z.infer<typeof mapboxConfigSchema>;

/** Fy agent outbound webhooks — n8n endpoint + shared X-Webhook-Secret. */
export const fyWebhookConfigSchema = z.object({
  url: z.string().trim().url().max(500).optional(),
  secret: secretSchema.optional(),
});
export type FyWebhookConfigInput = z.infer<typeof fyWebhookConfigSchema>;

export const integrationConfigSchemas = {
  [IntegrationProvider.RESEND]: resendConfigSchema,
  [IntegrationProvider.MOBILE_MESSAGE]: mobileMessageConfigSchema,
  [IntegrationProvider.MAPBOX]: mapboxConfigSchema,
  [IntegrationProvider.FY_WEBHOOK]: fyWebhookConfigSchema,
} as const;

export const integrationUpsertSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional(),
});
export type IntegrationUpsertInput = z.infer<typeof integrationUpsertSchema>;

// --- Responses ---

export const integrationConfigSourceSchema = z.enum(['database', 'env', 'none']);
export type IntegrationConfigSource = z.infer<typeof integrationConfigSourceSchema>;

/** Status row consumed by the dashboard warning banners. */
export const integrationStatusSchema = z.object({
  provider: integrationProviderSchema,
  configured: z.boolean(),
  source: integrationConfigSourceSchema,
  enabled: z.boolean(),
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationStatusListSchema = z.object({
  integrations: z.array(integrationStatusSchema),
});
export type IntegrationStatusList = z.infer<typeof integrationStatusListSchema>;

/** Detail row for the hub screen — secrets masked (last 4), never returned raw. */
export const integrationDetailSchema = integrationStatusSchema.extend({
  maskedConfig: z.record(z.string(), z.string().nullable()),
  updatedAt: z.string().datetime().nullable(),
});
export type IntegrationDetail = z.infer<typeof integrationDetailSchema>;

export const integrationListSchema = z.object({
  integrations: z.array(integrationDetailSchema),
});
export type IntegrationList = z.infer<typeof integrationListSchema>;

export const integrationTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type IntegrationTestResult = z.infer<typeof integrationTestResultSchema>;
