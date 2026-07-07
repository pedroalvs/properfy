import { IntegrationProvider, type IntegrationStatus } from '@properfy/shared';

import {
  REQUIRED_CONFIG_KEYS,
  type IIntegrationSettingRepository,
  type IntegrationConfig,
  type ResolvedIntegrationConfig,
} from '../domain/integration-setting';

interface ResolverLogger {
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

interface CacheEntry {
  resolved: ResolvedIntegrationConfig | null;
  /** enabled=false on the DB row means "intentionally off" — no env fallback. */
  disabled: boolean;
  expiresAt: number;
}

const ALL_PROVIDERS = Object.values(IntegrationProvider);

function isComplete(provider: IntegrationProvider, config: IntegrationConfig): boolean {
  return REQUIRED_CONFIG_KEYS[provider].every((key) => !!config[key]);
}

/**
 * Resolves outbound integration credentials with precedence
 * database → env → none, caching results in memory. The cache is invalidated
 * explicitly on settings writes and expires on a short TTL so horizontally
 * scaled instances converge without cross-process signalling.
 */
export class IntegrationConfigResolver {
  private readonly cache = new Map<IntegrationProvider, CacheEntry>();

  constructor(
    private readonly repo: IIntegrationSettingRepository,
    private readonly envFallback: Partial<Record<IntegrationProvider, IntegrationConfig>>,
    private readonly logger: ResolverLogger,
    private readonly ttlMs = 60_000,
  ) {}

  invalidate(provider?: IntegrationProvider): void {
    if (provider) this.cache.delete(provider);
    else this.cache.clear();
  }

  async getConfig(provider: IntegrationProvider): Promise<ResolvedIntegrationConfig | null> {
    const entry = await this.resolve(provider);
    return entry.resolved;
  }

  async getStatus(): Promise<IntegrationStatus[]> {
    return Promise.all(
      ALL_PROVIDERS.map(async (provider) => {
        const entry = await this.resolve(provider);
        return {
          provider,
          configured: entry.resolved !== null,
          source: entry.resolved?.source ?? 'none',
          enabled: !entry.disabled,
        };
      }),
    );
  }

  private async resolve(provider: IntegrationProvider): Promise<CacheEntry> {
    const cached = this.cache.get(provider);
    if (cached && cached.expiresAt > Date.now()) return cached;

    let resolved: ResolvedIntegrationConfig | null = null;
    let disabled = false;

    try {
      const row = await this.repo.get(provider);
      if (row) {
        if (!row.enabled) {
          disabled = true;
        } else if (isComplete(provider, row.config)) {
          resolved = { config: row.config, source: 'database' };
        }
      }
    } catch (error) {
      // A broken row (decrypt failure, bad JSON) must never take sends down —
      // log loudly and fall through to env.
      this.logger.error({ provider, error }, 'integration config lookup failed; falling back to env');
    }

    if (!resolved && !disabled) {
      const envConfig = this.envFallback[provider];
      if (envConfig && isComplete(provider, envConfig)) {
        resolved = { config: envConfig, source: 'env' };
      }
    }

    const entry: CacheEntry = { resolved, disabled, expiresAt: Date.now() + this.ttlMs };
    this.cache.set(provider, entry);
    return entry;
  }
}
