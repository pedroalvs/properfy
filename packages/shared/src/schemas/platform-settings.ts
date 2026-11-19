import { z } from 'zod';
import { GeofenceMode } from '../enums/field-events';
import { InspectorLevel } from '../enums/inspector-program';
import { DEFAULT_ROUTE_WEIGHTS } from '../route-planning/types';

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

/** A single route-planning weight: 0–10 with at most one decimal place (F04-2). */
const routeWeight = z
  .number()
  .min(0)
  .max(10)
  .refine((v) => Math.abs(Math.round(v * 10) - v * 10) < 1e-9, 'Use at most one decimal place');

export const routeWeightsSettingSchema = z
  .object({
    travel: routeWeight,
    windowWait: routeWeight,
    baseProximity: routeWeight,
  })
  .refine((w) => w.travel + w.windowWait + w.baseProximity > 0, {
    message: 'At least one weight must be greater than 0',
  });
export type RouteWeightsSetting = z.infer<typeof routeWeightsSettingSchema>;

/**
 * Tenant arrival-notice behaviour (F06). Born disabled — nothing is sent until
 * AM/OP enable it, even after the TASK-F06-2 triggers ship. `smsBudgetSharePercent`
 * reserves the rest of the agency's daily SMS cap for mandatory notices (D15).
 */
export const tenantEtaNoticesSettingSchema = z
  .object({
    enabled: z.boolean(),
    channelMode: z.enum(['BOTH', 'SMS_ELSE_EMAIL']),
    morningHour: z.number().int().min(5).max(11),
    morningCutoffHour: z.number().int().min(6).max(12),
    delayThresholdMinutes: z.number().int().min(5).max(120),
    smsBudgetSharePercent: z.number().int().min(10).max(100),
  })
  .refine((v) => v.morningCutoffHour > v.morningHour, {
    path: ['morningCutoffHour'],
    message: 'Cutoff must be after the morning notice hour',
  });
export type TenantEtaNoticesSetting = z.infer<typeof tenantEtaNoticesSettingSchema>;

/**
 * Live Day alert thresholds (F05). `delayMinutes` fires a DELAY alert when the
 * accumulated delay exceeds it (strict); `notStartedMinutes` fires a NOT_STARTED
 * alert when now exceeds a stop's planned start + this value. Platform default;
 * optionally overridden per inspector in `inspectors.alert_overrides_json`.
 */
const liveDayAlertMinutes = z.number().int().min(5).max(240);
export const liveDayAlertsSettingSchema = z.object({
  delayMinutes: liveDayAlertMinutes,
  notStartedMinutes: liveDayAlertMinutes,
});
export type LiveDayAlertsSetting = z.infer<typeof liveDayAlertsSettingSchema>;
export const DEFAULT_LIVE_DAY_ALERTS = { delayMinutes: 20, notStartedMinutes: 30 } as const;

/**
 * Reliability index weights and thresholds (F07). The eight per-metric weights
 * (0–10 integers; at least one > 0) drive the score; `minimumVolume` gates
 * whether an inspector is scored at all; `volumeReferenceOverride` (null =
 * median of active inspectors, P11) pins a fixed volume reference;
 * `minimumRatings` is the floor below which SATISFACTION is dropped (L-F07-03).
 * The weights object carries exactly the `RELIABILITY_METRIC_KEYS`.
 */
const reliabilityMetricWeight = z.number().int().min(0).max(10);
export const reliabilityIndexSettingSchema = z.object({
  weights: z
    .object({
      PUNCTUALITY: reliabilityMetricWeight,
      GEOFENCE: reliabilityMetricWeight,
      NO_STUCK: reliabilityMetricWeight,
      SATISFACTION: reliabilityMetricWeight,
      LATE_NOTICE: reliabilityMetricWeight,
      CANT_ATTEND: reliabilityMetricWeight,
      VOLUME: reliabilityMetricWeight,
      DONE_REJECTED: reliabilityMetricWeight,
    })
    .refine((w) => Object.values(w).some((v) => v > 0), { message: 'Set at least one weight above 0' }),
  minimumVolume: z.number().int().min(1).max(200),
  volumeReferenceOverride: z.number().int().min(1).max(1000).nullable(),
  minimumRatings: z.number().int().min(1).max(50),
});
export type ReliabilityIndexSetting = z.infer<typeof reliabilityIndexSettingSchema>;

export const DEFAULT_RELIABILITY_INDEX = {
  weights: {
    PUNCTUALITY: 1,
    GEOFENCE: 1,
    NO_STUCK: 1,
    SATISFACTION: 1,
    LATE_NOTICE: 1,
    CANT_ATTEND: 1,
    VOLUME: 1,
    DONE_REJECTED: 1,
  },
  minimumVolume: 10,
  volumeReferenceOverride: null,
  minimumRatings: 3,
} as const;

/**
 * Property files & issues configuration (F10 D29). One key, a six-field object —
 * allowed MIME types + max size for Document/Report/Other, the image-only MIME
 * set + per-issue photo cap for issues, and the two retention windows
 * (`retentionDays` null = keep active files forever; `deletedRetentionDays` is
 * when soft-deleted files are purged from storage, default 365).
 */
export const propertyFilesSettingSchema = z.object({
  allowedMimes: z.array(z.string().min(1)).min(1),
  maxFileSizeMb: z.number().int().min(5).max(200),
  issueImageMimes: z.array(z.string().min(1)).min(1),
  maxPhotosPerIssue: z.number().int().min(1).max(20),
  retentionDays: z.number().int().min(1).nullable(),
  deletedRetentionDays: z.number().int().min(30).max(3650),
});
export type PropertyFilesSetting = z.infer<typeof propertyFilesSettingSchema>;

export const DEFAULT_PROPERTY_FILES_SETTING: PropertyFilesSetting = {
  allowedMimes: [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  maxFileSizeMb: 20,
  issueImageMimes: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  maxPhotosPerIssue: 10,
  retentionDays: null,
  deletedRetentionDays: 365,
};

/**
 * Inspector program configuration (F08 D3/D12). One key, two objects: the level
 * thresholds (`silverMinScore`/`goldMinScore`, 0 < silver < gold ≤ 100, one
 * decimal) and the early-access config (`enabled`/`hours`/`minLevel`/`enabledAt`).
 * `enabledAt` is filled by the server when early access is switched on
 * (TASK-F08-2); a client-supplied value is ignored. Platform-scoped (no tenant_id).
 */
const inspectorProgramLevelScore = z.number().min(0.1).max(100).multipleOf(0.1);
export const inspectorProgramSettingSchema = z.object({
  levels: z
    .object({
      silverMinScore: inspectorProgramLevelScore,
      goldMinScore: inspectorProgramLevelScore,
    })
    .refine((l) => l.goldMinScore > l.silverMinScore, {
      message: 'Gold must be above Silver',
      path: ['goldMinScore'],
    }),
  earlyAccess: z.object({
    enabled: z.boolean(),
    hours: z.number().int().min(1).max(72),
    minLevel: z.nativeEnum(InspectorLevel),
    enabledAt: z.string().datetime().nullable(),
  }),
});
export type InspectorProgramSetting = z.infer<typeof inspectorProgramSettingSchema>;

export const DEFAULT_INSPECTOR_PROGRAM: InspectorProgramSetting = {
  levels: { silverMinScore: 60, goldMinScore: 85 },
  earlyAccess: { enabled: false, hours: 12, minLevel: InspectorLevel.GOLD, enabledAt: null },
};

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
  routeWeights: {
    schema: routeWeightsSettingSchema,
    defaults: DEFAULT_ROUTE_WEIGHTS,
    section: 'Route planning',
  },
  tenantEtaNotices: {
    schema: tenantEtaNoticesSettingSchema,
    defaults: {
      enabled: false,
      channelMode: 'BOTH',
      morningHour: 7,
      morningCutoffHour: 9,
      delayThresholdMinutes: 20,
      smsBudgetSharePercent: 80,
    },
    section: 'Tenant arrival notices',
  },
  liveDayAlerts: {
    schema: liveDayAlertsSettingSchema,
    defaults: DEFAULT_LIVE_DAY_ALERTS,
    section: 'Live Day alerts',
  },
  reliabilityIndex: {
    schema: reliabilityIndexSettingSchema,
    defaults: DEFAULT_RELIABILITY_INDEX,
    section: 'Reliability index',
  },
  propertyFiles: {
    schema: propertyFilesSettingSchema,
    defaults: DEFAULT_PROPERTY_FILES_SETTING,
    section: 'Property files',
  },
  inspectorProgram: {
    schema: inspectorProgramSettingSchema,
    defaults: DEFAULT_INSPECTOR_PROGRAM,
    section: 'Inspector program',
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
