import {
  type PlatformSettingKey,
  type PlatformSettingValue,
  resolvePlatformSettingValue,
} from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import type { IPlatformSettingRepository } from '../domain/platform-setting.repository';

/** Minimal logger surface (pino-compatible); only `error` is used. */
export interface PlatformSettingsLogger {
  error(obj: object, msg?: string): void;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Reads platform settings for the backend through the shared port, with a short
 * per-instance cache. An invalid stored value resolves to the registry defaults
 * and logs once per reload, so the hot path (check-in) never breaks on config.
 * Writes elsewhere call `invalidate(key)`; other instances converge within the TTL.
 */
export class PlatformSettingsService implements IPlatformSettingsReader {
  private readonly cache = new Map<PlatformSettingKey, { value: unknown; expiresAt: number }>();

  constructor(
    private readonly repository: IPlatformSettingRepository,
    private readonly logger: PlatformSettingsLogger,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async get<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) {
      return hit.value as PlatformSettingValue<K>;
    }

    const row = await this.repository.findByKey(key);
    const { value, valid } = resolvePlatformSettingValue(key, row?.valueJson ?? null);
    if (!valid) {
      this.logger.error({ key }, 'Invalid stored platform setting value; using defaults');
    }
    this.cache.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  invalidate(key: PlatformSettingKey): void {
    this.cache.delete(key);
  }
}
