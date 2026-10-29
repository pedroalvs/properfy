import { z } from 'zod';
import { GeofenceMode } from '../enums/field-events';

/**
 * Platform-wide settings registry (F03 B6).
 *
 * A feature adds configuration by appending ONE new key below (`{ schema,
 * defaults, section }`) with complete defaults. Never repurpose an existing key
 * for another feature's fields. `section` is the display label of the settings
 * section — the same text as the web `FormSection` title (L-F06-10).
 *
 * `PlatformSetting` rows are platform-scoped (no `tenant_id`): the absence of a
 * row means "use the defaults below", so nothing is seeded.
 */

export const fieldEventsSettingSchema = z.object({
  geofenceRadiusMeters: z.number().int().min(50).max(5000),
  geofenceMode: z.nativeEnum(GeofenceMode),
  checkInWindowToleranceMinutes: z.number().int().min(0).max(240),
  completionReminderEnabled: z.boolean(),
  completionReminderMinutesAfterWindowEnd: z.number().int().min(0).max(720),
});
export type FieldEventsSetting = z.infer<typeof fieldEventsSettingSchema>;

export const PLATFORM_SETTINGS_REGISTRY = {
  fieldEvents: {
    schema: fieldEventsSettingSchema,
    defaults: {
      geofenceRadiusMeters: 300,
      geofenceMode: 'FLAG',
      checkInWindowToleranceMinutes: 15,
      completionReminderEnabled: true,
      completionReminderMinutesAfterWindowEnd: 30,
    },
    section: 'Field events',
  },
} as const satisfies Record<string, { schema: z.ZodTypeAny; defaults: unknown; section: string }>;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS_REGISTRY;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.infer<
  (typeof PLATFORM_SETTINGS_REGISTRY)[K]['schema']
>;

export function isPlatformSettingKey(key: string): key is PlatformSettingKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_SETTINGS_REGISTRY, key);
}

/**
 * Merge the stored JSON over the key's defaults and parse. On failure (missing
 * row, schema drift, invalid value) return the defaults with `valid: false` so
 * the hot path (check-in) never breaks on configuration.
 */
export function resolvePlatformSettingValue<K extends PlatformSettingKey>(
  key: K,
  stored: unknown,
): { value: PlatformSettingValue<K>; valid: boolean } {
  const registry = PLATFORM_SETTINGS_REGISTRY[key];
  const defaults = registry.defaults as PlatformSettingValue<K>;
  const merged =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? { ...(defaults as object), ...(stored as object) }
      : defaults;
  const parsed = registry.schema.safeParse(merged);
  if (parsed.success) {
    return { value: parsed.data as PlatformSettingValue<K>, valid: true };
  }
  return { value: defaults, valid: false };
}

/** Request body for `PUT /v1/platform-settings/:key`. Validated per key in the use case. */
export const updatePlatformSettingSchema = z.object({ value: z.record(z.unknown()) });
export type UpdatePlatformSettingInput = z.infer<typeof updatePlatformSettingSchema>;

// Local nullable-instant helper (responses.ts keeps its own copy module-private).
const instantStrNullable = () =>
  z.union([z.string(), z.date().transform((d) => d.toISOString())]).nullable();

export const platformSettingResponseSchema = z.object({
  key: z.string(),
  section: z.string(),
  value: z.record(z.unknown()),
  defaults: z.record(z.unknown()),
  isDefault: z.boolean(),
  updatedAt: instantStrNullable(),
  updatedBy: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
});
export type PlatformSettingResponse = z.infer<typeof platformSettingResponseSchema>;

export const platformSettingsListResponseSchema = z.object({
  settings: z.array(platformSettingResponseSchema),
});
export type PlatformSettingsListResponse = z.infer<typeof platformSettingsListResponseSchema>;
