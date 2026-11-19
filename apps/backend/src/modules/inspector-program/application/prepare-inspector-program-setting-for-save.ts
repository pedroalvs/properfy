import type { InspectorProgramSetting } from '@properfy/shared';

/**
 * Server-owned `earlyAccess.enabledAt` (L-F08-08). Registered into
 * `PLATFORM_SETTING_SAVE_HOOKS` for the `inspectorProgram` key, so it runs after
 * validation and before the write/audit in `UpdatePlatformSettingUseCase`.
 *
 * - `enabled` goes `false → true` (or from a defaults-only previous): stamp `now`,
 *   ignoring any client-supplied `enabledAt`.
 * - `enabled` stays `true`: keep the previous `enabledAt`.
 * - `enabled` ends `false`: clear `enabledAt` to `null`.
 *
 * Pure and synchronous; a client value for `enabledAt` is always discarded.
 */
export function prepareInspectorProgramSettingForSave(
  previous: InspectorProgramSetting,
  next: InspectorProgramSetting,
  now: Date,
): InspectorProgramSetting {
  let enabledAt: string | null;
  if (!next.earlyAccess.enabled) {
    enabledAt = null;
  } else if (previous.earlyAccess.enabled) {
    enabledAt = previous.earlyAccess.enabledAt;
  } else {
    enabledAt = now.toISOString();
  }

  return { ...next, earlyAccess: { ...next.earlyAccess, enabledAt } };
}
