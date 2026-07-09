import type { IntegrationConfigSource, IntegrationProvider } from '@properfy/shared';

// Platform-level outbound integration credentials (Resend, MobileMessage,
// Mapbox) managed by AM via the Integrations Hub. The decrypted config is a
// flat string record whose keys are provider-specific (see the shared
// per-provider Zod schemas). Database config overrides env vars; when neither
// exists the platform degrades to stub providers.

export type IntegrationConfig = Record<string, string>;

export interface IntegrationSetting {
  provider: IntegrationProvider;
  config: IntegrationConfig;
  enabled: boolean;
  updatedById: string | null;
  updatedAt: Date;
}

export interface IIntegrationSettingRepository {
  get(provider: IntegrationProvider): Promise<IntegrationSetting | null>;
  list(): Promise<IntegrationSetting[]>;
  upsert(
    provider: IntegrationProvider,
    config: IntegrationConfig,
    enabled: boolean,
    updatedById: string,
  ): Promise<IntegrationSetting>;
  delete(provider: IntegrationProvider): Promise<void>;
}

/** Resolved credentials for one provider plus where they came from. */
export interface ResolvedIntegrationConfig {
  config: IntegrationConfig;
  source: Exclude<IntegrationConfigSource, 'none'>;
}

/**
 * Fields that must all be present for a provider to count as configured.
 * A partial config (e.g. Resend apiKey without fromEmail) resolves to none.
 */
export const REQUIRED_CONFIG_KEYS: Record<IntegrationProvider, string[]> = {
  resend: ['apiKey', 'fromEmail'],
  mobile_message: ['apiKey', 'password', 'senderId'],
  mapbox: ['accessToken'],
  fy_webhook: ['url', 'secret'],
};

/** Keys whose values are secrets — masked in responses, write-only in updates. */
export const SECRET_CONFIG_KEYS: Record<IntegrationProvider, string[]> = {
  resend: ['apiKey'],
  mobile_message: ['apiKey', 'password', 'webhookToken'],
  mapbox: ['accessToken'],
  fy_webhook: ['secret'],
};
