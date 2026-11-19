import { describe, it, expect } from 'vitest';
import {
  liveDayQuerySchema,
  liveDayResponseSchema,
  liveDayInspectorSchema,
  liveDayAlertSchema,
  lockedTimeQuerySchema,
  lockedTimeResponseSchema,
  updateInspectorAlertThresholdsSchema,
  LIVE_DAY_SHOW_ALL_MAX,
  LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS,
  // wire helpers (T004): importable from the package root barrel
  civilDateStr,
  instantStr,
  civilDateStrNullable,
  instantStrNullable,
} from '../index';

describe('liveDayQuerySchema', () => {
  it('accepts empty, date, and geometry variants', () => {
    expect(liveDayQuerySchema.safeParse({}).success).toBe(true);
    expect(liveDayQuerySchema.safeParse({ date: '2026-11-05' }).success).toBe(true);
    expect(liveDayQuerySchema.safeParse({ includeGeometry: 'all' }).success).toBe(true);
    expect(
      liveDayQuerySchema.safeParse({
        includeGeometry: 'selected',
        inspectorId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('defaults includeGeometry to none', () => {
    const parsed = liveDayQuerySchema.parse({});
    expect(parsed.includeGeometry).toBe('none');
  });

  it('rejects a non-civil date, an unknown geometry mode, and a non-uuid inspectorId', () => {
    expect(liveDayQuerySchema.safeParse({ date: '05/11/2026' }).success).toBe(false);
    expect(liveDayQuerySchema.safeParse({ includeGeometry: 'some' }).success).toBe(false);
    expect(liveDayQuerySchema.safeParse({ inspectorId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('liveDayResponseSchema / liveDayInspectorSchema', () => {
  it('requires today', () => {
    const shape = liveDayResponseSchema.shape;
    expect('today' in shape).toBe(true);
  });

  it('requires routeFeasible and routeViolations on the inspector', () => {
    const shape = liveDayInspectorSchema.shape;
    expect('routeFeasible' in shape).toBe(true);
    expect('routeViolations' in shape).toBe(true);
  });

  it('keeps exactly the 7 alert types (no ROUTE_INFEASIBLE)', () => {
    const typeField = liveDayAlertSchema.shape.type;
    const seven = ['CANT_DO', 'COMPLETION_REMINDER', 'DELAY', 'GEOFENCE', 'LATE_NOTICE', 'NOT_STARTED', 'OUT_OF_WINDOW'];
    for (const t of seven) expect(typeField.safeParse(t).success).toBe(true);
    expect(typeField.safeParse('ROUTE_INFEASIBLE').success).toBe(false);
  });
});

describe('lockedTime schemas', () => {
  it('byRegion rows require agencyName (string | null)', () => {
    const base = { regionId: null, regionName: 'No region', confirmed: 1, required: 2, percent: 50 };
    const row = lockedTimeResponseSchema.shape.byRegion.element;
    expect(row.safeParse({ ...base, agencyName: null }).success).toBe(true);
    expect(row.safeParse({ ...base, agencyName: 'Ray White' }).success).toBe(true);
    expect(row.safeParse(base).success).toBe(false); // agencyName missing
  });

  it('lockedTimeQuerySchema accepts empty and civil from/to', () => {
    expect(lockedTimeQuerySchema.safeParse({}).success).toBe(true);
    expect(lockedTimeQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-14' }).success).toBe(true);
    expect(lockedTimeQuerySchema.safeParse({ from: 'bad' }).success).toBe(false);
  });
});

describe('updateInspectorAlertThresholdsSchema', () => {
  it('accepts null in both fields and requires both keys', () => {
    expect(updateInspectorAlertThresholdsSchema.safeParse({ delayMinutes: null, notStartedMinutes: null }).success).toBe(true);
    expect(updateInspectorAlertThresholdsSchema.safeParse({ delayMinutes: 15, notStartedMinutes: null }).success).toBe(true);
    expect(updateInspectorAlertThresholdsSchema.safeParse({ delayMinutes: 15 }).success).toBe(false); // missing notStartedMinutes
    expect(updateInspectorAlertThresholdsSchema.safeParse({ delayMinutes: 4, notStartedMinutes: 30 }).success).toBe(false);
    expect(updateInspectorAlertThresholdsSchema.safeParse({ delayMinutes: 15, notStartedMinutes: 30, foo: 1 }).success).toBe(false); // .strict()
  });
});

describe('shared caps', () => {
  it('exports the client and server caps', () => {
    expect(LIVE_DAY_SHOW_ALL_MAX).toBe(40);
    expect(LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS).toBe(60);
  });
});

describe('wire helpers exported from the barrel (T004)', () => {
  it('civilDateStr: Date -> YYYY-MM-DD', () => {
    expect(civilDateStr().parse(new Date('2026-11-05T13:00:00Z'))).toBe('2026-11-05');
  });
  it('instantStr: Date -> ISO', () => {
    expect(instantStr().parse(new Date('2026-11-05T13:00:00Z'))).toBe('2026-11-05T13:00:00.000Z');
  });
  it('nullable variants accept null', () => {
    expect(civilDateStrNullable().parse(null)).toBeNull();
    expect(instantStrNullable().parse(null)).toBeNull();
  });
});
