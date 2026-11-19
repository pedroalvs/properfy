import { describe, it, expect } from 'vitest';
import { RUNTIME_CACHING_ROUTES } from '../runtime-caching';
import { INSPECTOR_API_CACHES } from '@/hooks/useAuth';

describe('RUNTIME_CACHING_ROUTES', () => {
  it('preserves the routes in the same order with the same strategies and cache names', () => {
    expect(RUNTIME_CACHING_ROUTES).toHaveLength(6);

    const [googleFonts, gstatic, schedule, appointments, dayPlan, offers] = RUNTIME_CACHING_ROUTES;

    expect(googleFonts.handler).toBe('CacheFirst');
    expect(googleFonts.cacheName).toBe('google-fonts-cache');
    expect(googleFonts.maxEntries).toBe(10);
    expect(googleFonts.maxAgeSeconds).toBe(60 * 60 * 24 * 365);
    expect(googleFonts.urlPattern.test('https://fonts.googleapis.com/css2?x')).toBe(true);

    expect(gstatic.handler).toBe('CacheFirst');
    expect(gstatic.cacheName).toBe('gstatic-fonts-cache');
    expect(gstatic.urlPattern.test('https://fonts.gstatic.com/s/inter.woff2')).toBe(true);

    expect(schedule.handler).toBe('NetworkFirst');
    expect(schedule.cacheName).toBe('api-schedule-cache');
    expect(schedule.maxEntries).toBe(50);
    expect(schedule.maxAgeSeconds).toBe(60 * 60 * 24);
    expect(schedule.networkTimeoutSeconds).toBe(10);
    expect(schedule.urlPattern.test('/v1/inspector/schedule?date=2026-11-10')).toBe(true);

    expect(appointments.handler).toBe('NetworkFirst');
    expect(appointments.cacheName).toBe('api-appointment-cache');
    expect(appointments.maxEntries).toBe(100);
    expect(appointments.maxAgeSeconds).toBe(5 * 60);
    expect(appointments.networkTimeoutSeconds).toBe(10);
    expect(appointments.urlPattern.test('/v1/inspector/appointments/abc')).toBe(true);

    expect(dayPlan.handler).toBe('NetworkFirst');
    expect(dayPlan.cacheName).toBe('api-day-plan-cache');
    expect(dayPlan.maxEntries).toBe(3);
    expect(dayPlan.maxAgeSeconds).toBe(12 * 60 * 60);
    expect(dayPlan.networkTimeoutSeconds).toBe(10);
    expect(dayPlan.urlPattern.test('/v1/inspector/day-plans/2026-11-05')).toBe(true);

    expect(offers.handler).toBe('NetworkOnly');
    expect(offers.cacheName).toBeUndefined();
    expect(offers.urlPattern.test('/v1/marketplace/offers')).toBe(true);
  });

  it('day-plan cache matches only the dated GET, not sheet / writes / AM-OP routes', () => {
    const dayPlan = RUNTIME_CACHING_ROUTES.find((r) => r.cacheName === 'api-day-plan-cache')!;
    expect(dayPlan.urlPattern.test('/v1/inspector/day-plans/2026-11-05')).toBe(true);
    for (const miss of [
      '/v1/inspector/day-plans/2026-11-05/sheet?format=pdf',
      '/v1/inspector/day-plans/2026-11-05/order',
      '/v1/inspector/day-plans/2026-11-05/origin',
      '/v1/inspector/day-plans/2026-11-05/recalculate',
      '/v1/day-plans/some-inspector/2026-11-05',
    ]) {
      expect(dayPlan.urlPattern.test(miss)).toBe(false);
    }
  });

  it('sets cacheableResponse [200] on the inspector API caches only (L-X00-10)', () => {
    const byName = Object.fromEntries(
      RUNTIME_CACHING_ROUTES.filter((r) => r.cacheName).map((r) => [r.cacheName, r]),
    );
    expect(byName['api-schedule-cache'].cacheableStatuses).toEqual([200]);
    expect(byName['api-appointment-cache'].cacheableStatuses).toEqual([200]);
    expect(byName['api-day-plan-cache'].cacheableStatuses).toEqual([200]);
    expect(byName['google-fonts-cache'].cacheableStatuses).toBeUndefined();
    expect(byName['gstatic-fonts-cache'].cacheableStatuses).toBeUndefined();

    const offers = RUNTIME_CACHING_ROUTES.find((r) => r.handler === 'NetworkOnly');
    expect(offers?.cacheableStatuses).toBeUndefined();
  });

  it('keeps the API cache names in sync with INSPECTOR_API_CACHES in useAuth', () => {
    const apiCacheNames = RUNTIME_CACHING_ROUTES.filter(
      (r) => r.handler === 'NetworkFirst',
    ).map((r) => r.cacheName);
    expect(apiCacheNames).toEqual(INSPECTOR_API_CACHES);
  });
});
