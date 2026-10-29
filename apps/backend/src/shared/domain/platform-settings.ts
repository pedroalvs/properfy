import type { PlatformSettingKey, PlatformSettingValue } from '@properfy/shared';

/**
 * Platform settings read port (domain).
 *
 * Lives in `shared/domain` — not in the `platform-settings` module — so any
 * module (e.g. `inspector-execution`) can read a setting through the interface
 * without importing the module, respecting the dependency rule (same pattern as
 * the `AuditService` port in `audit.ts`).
 *
 * The concrete implementation (`PlatformSettingsService`) lives in the
 * platform-settings module and caches per instance (30 s TTL). An invalid stored
 * value resolves to the registry defaults, so reads never throw.
 */
export interface IPlatformSettingsReader {
  get<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>>;
}
