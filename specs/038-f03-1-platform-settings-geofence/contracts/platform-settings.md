# Contract — Platform settings API

Source of truth after implementation: `packages/shared/openapi.json` (generated). Zod schemas in `packages/shared/src/schemas/platform-settings.ts`.

## Shared schemas

```ts
// enums/field-events.ts
export const GeofenceMode = { FLAG: 'FLAG', BLOCK: 'BLOCK' } as const;
export type GeofenceMode = (typeof GeofenceMode)[keyof typeof GeofenceMode];

// schemas/platform-settings.ts
export const fieldEventsSettingSchema = z.object({
  geofenceRadiusMeters: z.number().int().min(50).max(5000),
  geofenceMode: z.nativeEnum(GeofenceMode),
  checkInWindowToleranceMinutes: z.number().int().min(0).max(240),
  completionReminderEnabled: z.boolean(),
  completionReminderMinutesAfterWindowEnd: z.number().int().min(0).max(720),
});

export const PLATFORM_SETTINGS_REGISTRY = {
  fieldEvents: {
    schema: fieldEventsSettingSchema,
    defaults: { geofenceRadiusMeters: 300, geofenceMode: 'FLAG', checkInWindowToleranceMinutes: 15, completionReminderEnabled: true, completionReminderMinutesAfterWindowEnd: 30 },
    section: 'Field events', // display label = web FormSection title
  },
} as const satisfies Record<string, { schema: z.ZodTypeAny; defaults: unknown; section: string }>;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS_REGISTRY;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.infer<(typeof PLATFORM_SETTINGS_REGISTRY)[K]['schema']>;
export function isPlatformSettingKey(key: string): key is PlatformSettingKey;
export function resolvePlatformSettingValue<K extends PlatformSettingKey>(key: K, stored: unknown): { value: PlatformSettingValue<K>; valid: boolean };

export const updatePlatformSettingSchema = z.object({ value: z.record(z.unknown()) }); // validated per key in the use case
export const platformSettingResponseSchema = z.object({
  key: z.string(), section: z.string(),
  value: z.record(z.unknown()), defaults: z.record(z.unknown()),
  isDefault: z.boolean(),
  updatedAt: instantStrNullable(),
  updatedBy: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
});
export const platformSettingsListResponseSchema = z.object({ settings: z.array(platformSettingResponseSchema) });
```

## Endpoints

| Method & route | Request | Response | Errors | RBAC | Idempotency-Key |
|---|---|---|---|---|---|
| `GET /v1/platform-settings` | – | 200 `success({ settings: PlatformSettingResponse[] })`, one entry per registry key, ordered by `section` | 401 `UNAUTHORIZED`; 403 `FORBIDDEN` | AM, OP | no |
| `GET /v1/platform-settings/:key` | params `key` (`z.string().max(100)`) | 200 `success(PlatformSettingResponse)` | 401; 403; 404 `PLATFORM_SETTING_UNKNOWN_KEY` | AM, OP | no |
| `PUT /v1/platform-settings/:key` | `{ value: <full key object> }` | 200 `success(PlatformSettingResponse)` | 400 `VALIDATION_ERROR` (Zod issues in `details`); 401; 403; 404 `PLATFORM_SETTING_UNKNOWN_KEY` | AM, OP | no (PUT is idempotent) |

- CL_ADMIN, CL_USER, INSP, TNT → 403 on all three. Internal reads bypass RBAC via `IPlatformSettingsReader`.
- `PUT` success: upsert with `updated_by_id = actor.userId`; audit `platform_setting.updated` (`actorType 'USER'`, `entityType 'PlatformSetting'`, `entityId = key`, `tenantId: null`, `before` = previous effective value (defaults if no row), `after` = stored value, `metadata.actor_tenant_id = actor.tenantId`); emit `platform_setting.updated.v1` once after commit. Saving the same value still writes + audits. A registered save hook for the key transforms the value after validation and before write (its return is stored/audited/emitted).
- Cache: per instance, TTL 30 s; `invalidate(key)` on write; other instances converge within the TTL.
