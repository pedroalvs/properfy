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
