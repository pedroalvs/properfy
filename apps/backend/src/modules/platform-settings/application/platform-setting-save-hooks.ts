import type { PlatformSettingKey, PlatformSettingValue } from '@properfy/shared';

/**
 * Optional per-key save hook (D30, L-F08-08). Applied in UpdatePlatformSettingUseCase
 * AFTER the value is validated against the key's schema and BEFORE the write/audit/event.
 * The returned value is what gets stored, audited and emitted. Pure and synchronous.
 *
 * A feature that must derive a field on save (e.g. F08's
 * `inspectorProgram.earlyAccess.enabledAt`) REGISTERS a hook here — it never edits
 * the use case. F03 ships the map empty.
 */
export type PlatformSettingSaveHook<K extends PlatformSettingKey> = (
  previous: PlatformSettingValue<K>,
  next: PlatformSettingValue<K>,
  now: Date,
) => PlatformSettingValue<K>;

export type PlatformSettingSaveHooks = Partial<{
  [K in PlatformSettingKey]: PlatformSettingSaveHook<K>;
}>;

export const PLATFORM_SETTING_SAVE_HOOKS: PlatformSettingSaveHooks = {};
