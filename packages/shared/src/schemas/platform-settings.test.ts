import { describe, it, expect } from 'vitest';
import {
  fieldEventsSettingSchema,
  PLATFORM_SETTINGS_REGISTRY,
  isPlatformSettingKey,
  resolvePlatformSettingValue,
} from './platform-settings';

describe('fieldEventsSettingSchema', () => {
  it('rejects an empty object (every field is required)', () => {
    expect(fieldEventsSettingSchema.safeParse({}).success).toBe(false);
  });

  it('accepts the registry defaults', () => {
    const defaults = PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults;
    expect(fieldEventsSettingSchema.safeParse(defaults).success).toBe(true);
  });

  it('enforces geofenceRadiusMeters bounds (50..5000, integer)', () => {
    const base = PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults;
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceRadiusMeters: 49 }).success).toBe(false);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceRadiusMeters: 50 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceRadiusMeters: 5000 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceRadiusMeters: 5001 }).success).toBe(false);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceRadiusMeters: 300.5 }).success).toBe(false);
  });

  it('enforces geofenceMode enum', () => {
    const base = PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults;
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceMode: 'WARN' }).success).toBe(false);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceMode: 'FLAG' }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, geofenceMode: 'BLOCK' }).success).toBe(true);
  });

  it('enforces checkInWindowToleranceMinutes bounds (0..240)', () => {
    const base = PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults;
    expect(fieldEventsSettingSchema.safeParse({ ...base, checkInWindowToleranceMinutes: -1 }).success).toBe(false);
    expect(fieldEventsSettingSchema.safeParse({ ...base, checkInWindowToleranceMinutes: 0 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, checkInWindowToleranceMinutes: 240 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, checkInWindowToleranceMinutes: 241 }).success).toBe(false);
  });

  it('enforces completionReminderMinutesAfterWindowEnd bounds (0..720)', () => {
    const base = PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults;
    expect(fieldEventsSettingSchema.safeParse({ ...base, completionReminderMinutesAfterWindowEnd: 0 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, completionReminderMinutesAfterWindowEnd: 720 }).success).toBe(true);
    expect(fieldEventsSettingSchema.safeParse({ ...base, completionReminderMinutesAfterWindowEnd: 721 }).success).toBe(false);
  });
});

describe('PLATFORM_SETTINGS_REGISTRY.fieldEvents', () => {
  it('has the documented onboarding defaults and a display section', () => {
    expect(PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults).toEqual({
      geofenceRadiusMeters: 300,
      geofenceMode: 'FLAG',
      checkInWindowToleranceMinutes: 15,
      completionReminderEnabled: true,
      completionReminderMinutesAfterWindowEnd: 30,
    });
    expect(PLATFORM_SETTINGS_REGISTRY.fieldEvents.section).toBe('Field events');
  });
});

describe('isPlatformSettingKey', () => {
  it('recognizes registry keys only', () => {
    expect(isPlatformSettingKey('fieldEvents')).toBe(true);
    expect(isPlatformSettingKey('nope')).toBe(false);
    // Must not be fooled by Object.prototype members.
    expect(isPlatformSettingKey('toString')).toBe(false);
  });
});

describe('resolvePlatformSettingValue', () => {
  it('merges a partial stored value over the defaults', () => {
    const { value, valid } = resolvePlatformSettingValue('fieldEvents', { geofenceMode: 'BLOCK' });
    expect(valid).toBe(true);
    expect(value).toEqual({ ...PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults, geofenceMode: 'BLOCK' });
  });

  it('returns defaults with valid=false when the stored value is invalid', () => {
    const { value, valid } = resolvePlatformSettingValue('fieldEvents', { geofenceRadiusMeters: 'abc' });
    expect(valid).toBe(false);
    expect(value).toEqual(PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults);
  });

  it('returns defaults when there is no stored value (null/undefined)', () => {
    expect(resolvePlatformSettingValue('fieldEvents', null)).toEqual({
      value: PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults,
      valid: true,
    });
    expect(resolvePlatformSettingValue('fieldEvents', undefined).valid).toBe(true);
  });
});

describe('tenantEtaNotices platform setting (F06)', () => {
  const schema = PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.schema;

  it('defaults are disabled with the onboarding values and the right section', () => {
    expect(PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.defaults).toEqual({
      enabled: false,
      channelMode: 'BOTH',
      morningHour: 7,
      morningCutoffHour: 9,
      delayThresholdMinutes: 20,
      smsBudgetSharePercent: 80,
    });
    expect(PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.section).toBe('Tenant arrival notices');
  });

  it('merges a partial stored value over the defaults', () => {
    expect(resolvePlatformSettingValue('tenantEtaNotices', { enabled: true })).toEqual({
      value: { ...PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.defaults, enabled: true },
      valid: true,
    });
  });

  it.each([
    { morningHour: 7, morningCutoffHour: 7 },
    { morningHour: 4 },
    { morningHour: 12 },
    { morningCutoffHour: 13 },
    { delayThresholdMinutes: 4 },
    { delayThresholdMinutes: 121 },
    { delayThresholdMinutes: 20.5 },
    { channelMode: 'EMAIL_ONLY' },
    { smsBudgetSharePercent: 9 },
    { smsBudgetSharePercent: 101 },
    { smsBudgetSharePercent: 79.5 },
  ])('rejects invalid %o', (patch) => {
    const value = { ...PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.defaults, ...patch };
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('reports the cutoff message when it is not after the morning hour', () => {
    const res = schema.safeParse({
      ...PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.defaults,
      morningHour: 7,
      morningCutoffHour: 7,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe('Cutoff must be after the morning notice hour');
      expect(res.error.issues[0]?.path).toEqual(['morningCutoffHour']);
    }
  });

  it.each([
    { morningHour: 6, morningCutoffHour: 7 },
    { delayThresholdMinutes: 5 },
    { delayThresholdMinutes: 120 },
    { channelMode: 'SMS_ELSE_EMAIL' },
    { smsBudgetSharePercent: 10 },
    { smsBudgetSharePercent: 100 },
  ])('accepts valid %o', (patch) => {
    const value = { ...PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.defaults, ...patch };
    expect(schema.safeParse(value).success).toBe(true);
  });
});

describe('liveDayAlerts platform setting (F05)', () => {
  const schema = PLATFORM_SETTINGS_REGISTRY.liveDayAlerts.schema;

  it('has the onboarding defaults and section label', () => {
    expect(PLATFORM_SETTINGS_REGISTRY.liveDayAlerts.defaults).toEqual({
      delayMinutes: 20,
      notStartedMinutes: 30,
    });
    expect(PLATFORM_SETTINGS_REGISTRY.liveDayAlerts.section).toBe('Live Day alerts');
  });

  it('accepts valid thresholds', () => {
    expect(schema.safeParse({ delayMinutes: 20, notStartedMinutes: 30 }).success).toBe(true);
    expect(schema.safeParse({ delayMinutes: 5, notStartedMinutes: 240 }).success).toBe(true);
  });

  it.each([
    { delayMinutes: 0, notStartedMinutes: 30 },
    { delayMinutes: 4, notStartedMinutes: 30 },
    { delayMinutes: 20, notStartedMinutes: 241 },
    { delayMinutes: 20.5, notStartedMinutes: 30 },
    { delayMinutes: 20 },
  ])('rejects invalid %o', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('is a known platform setting key', () => {
    expect(isPlatformSettingKey('liveDayAlerts')).toBe(true);
  });

  it('merges a stored value over defaults', () => {
    expect(resolvePlatformSettingValue('liveDayAlerts', { delayMinutes: 25 })).toEqual({
      value: { delayMinutes: 25, notStartedMinutes: 30 },
      valid: true,
    });
  });

  it('falls back to defaults on an invalid stored value', () => {
    expect(resolvePlatformSettingValue('liveDayAlerts', { delayMinutes: 'x' })).toEqual({
      value: PLATFORM_SETTINGS_REGISTRY.liveDayAlerts.defaults,
      valid: false,
    });
  });
});
