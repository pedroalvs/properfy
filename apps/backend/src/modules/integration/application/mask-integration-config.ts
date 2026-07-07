import {
  integrationConfigSchemas,
  type IntegrationProvider,
} from '@properfy/shared';

import { SECRET_CONFIG_KEYS, type IntegrationConfig } from '../domain/integration-setting';

const MASK = '••••';

/**
 * Builds the read model of a provider config: every known key is present
 * (null when unset), secret values reduced to a mask plus their last 4 chars.
 * Raw secrets must never leave the application layer through this path.
 */
export function maskIntegrationConfig(
  provider: IntegrationProvider,
  config: IntegrationConfig | null,
): Record<string, string | null> {
  const knownKeys = Object.keys(integrationConfigSchemas[provider].shape);
  const secretKeys = SECRET_CONFIG_KEYS[provider];

  return Object.fromEntries(
    knownKeys.map((key) => {
      const value = config?.[key];
      if (!value) return [key, null];
      if (!secretKeys.includes(key)) return [key, value];
      return [key, value.length > 4 ? `${MASK}${value.slice(-4)}` : MASK];
    }),
  );
}
