import {
  PLATFORM_SETTINGS_REGISTRY,
  resolvePlatformSettingValue,
  type PlatformSettingKey,
  type PlatformSettingResponse,
} from '@properfy/shared';
import type { PlatformSettingRow } from '../domain/platform-setting.repository';

/** Build the API response for one key from its stored row (null ⇒ defaults). */
export function toPlatformSettingResponse(
  key: PlatformSettingKey,
  row: PlatformSettingRow | null,
): PlatformSettingResponse {
  const registry = PLATFORM_SETTINGS_REGISTRY[key];
  const value = row ? resolvePlatformSettingValue(key, row.valueJson).value : registry.defaults;
  return {
    key,
    section: registry.section,
    value: value as Record<string, unknown>,
    defaults: registry.defaults as Record<string, unknown>,
    isDefault: row === null,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedBy: row ? row.updatedBy : null,
  };
}
