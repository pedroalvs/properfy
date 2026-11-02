import { describe, it, expect } from 'vitest';
import {
  routeWeightsSettingSchema,
  PLATFORM_SETTINGS_REGISTRY,
  resolvePlatformSettingValue,
} from './platform-settings';

describe('routeWeightsSettingSchema', () => {
  const base = { travel: 1, windowWait: 1, baseProximity: 1 };

  it('accepts the onboarding defaults (1/1/1)', () => {
    expect(routeWeightsSettingSchema.safeParse(base).success).toBe(true);
  });

  it('accepts bounds 0, 0.1, 9.9, 10 (as long as the sum is > 0)', () => {
    expect(routeWeightsSettingSchema.safeParse({ travel: 0, windowWait: 0, baseProximity: 10 }).success).toBe(true);
    expect(routeWeightsSettingSchema.safeParse({ travel: 0.1, windowWait: 9.9, baseProximity: 0 }).success).toBe(true);
    expect(routeWeightsSettingSchema.safeParse({ travel: 10, windowWait: 10, baseProximity: 10 }).success).toBe(true);
  });

  it('rejects out-of-range weights (-0.1, 10.1)', () => {
    expect(routeWeightsSettingSchema.safeParse({ ...base, travel: -0.1 }).success).toBe(false);
    expect(routeWeightsSettingSchema.safeParse({ ...base, travel: 10.1 }).success).toBe(false);
  });

  it('rejects more than one decimal place (0.15)', () => {
    expect(routeWeightsSettingSchema.safeParse({ ...base, windowWait: 0.15 }).success).toBe(false);
  });

  it('rejects all-zero with the documented message', () => {
    const result = routeWeightsSettingSchema.safeParse({ travel: 0, windowWait: 0, baseProximity: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('At least one weight must be greater than 0');
    }
  });
});

describe('PLATFORM_SETTINGS_REGISTRY.routeWeights', () => {
  it('has defaults 1/1/1 and the "Route planning" section', () => {
    expect(PLATFORM_SETTINGS_REGISTRY.routeWeights.defaults).toEqual({
      travel: 1,
      windowWait: 1,
      baseProximity: 1,
    });
    expect(PLATFORM_SETTINGS_REGISTRY.routeWeights.section).toBe('Route planning');
  });

  it('resolvePlatformSettingValue returns the defaults for an empty stored value', () => {
    expect(resolvePlatformSettingValue('routeWeights', {})).toEqual({
      value: { travel: 1, windowWait: 1, baseProximity: 1 },
      valid: true,
    });
  });

  it('resolvePlatformSettingValue merges a partial stored value over the defaults', () => {
    const { value, valid } = resolvePlatformSettingValue('routeWeights', { travel: 2 });
    expect(valid).toBe(true);
    expect(value).toEqual({ travel: 2, windowWait: 1, baseProximity: 1 });
  });

  it('resolvePlatformSettingValue falls back to defaults on an invalid stored value', () => {
    const { value, valid } = resolvePlatformSettingValue('routeWeights', { travel: 99 });
    expect(valid).toBe(false);
    expect(value).toEqual({ travel: 1, windowWait: 1, baseProximity: 1 });
  });
});
