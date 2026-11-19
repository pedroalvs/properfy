import { describe, it, expect } from 'vitest';
import {
  inspectorScheduleMonthQuerySchema,
  inspectorScheduleQuerySchema,
  startInspectionSchema,
  finishInspectionSchema,
  inspectorEarningsSummaryQuerySchema,
} from './inspection-execution';

describe('inspectorScheduleQuerySchema', () => {
  it('should accept empty object', () => {
    const result = inspectorScheduleQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid date', () => {
    const result = inspectorScheduleQuerySchema.safeParse({ date: '2026-03-21' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const result = inspectorScheduleQuerySchema.safeParse({ date: '03-21-2026' });
    expect(result.success).toBe(false);
  });
});

describe('inspectorScheduleMonthQuerySchema', () => {
  it('should accept empty object', () => {
    const result = inspectorScheduleMonthQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject query parameters because the window is backend-defined', () => {
    const result = inspectorScheduleMonthQuerySchema.safeParse({ from: '2026-03-21' });
    expect(result.success).toBe(false);
  });
});

describe('startInspectionSchema', () => {
  it('should accept valid coordinates', () => {
    const result = startInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(result.success).toBe(true);
  });

  it('should reject latitude greater than 90', () => {
    const result = startInspectionSchema.safeParse({
      latitude: 91,
      longitude: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject longitude less than -180', () => {
    const result = startInspectionSchema.safeParse({
      latitude: 0,
      longitude: -181,
    });
    expect(result.success).toBe(false);
  });
});

describe('finishInspectionSchema', () => {
  it('should accept input with lat/lng only', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(result.success).toBe(true);
  });

  it('should strip unknown fields (finish carries geolocation only)', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
      checklistJson: { item1: true },
      notes: 'unexpected',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ latitude: -23.5505, longitude: -46.6333 });
    }
  });

  it('should reject out-of-range latitude', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: 100,
      longitude: -46.6333,
    });
    expect(result.success).toBe(false);
  });
});

describe('inspectorEarningsSummaryQuerySchema', () => {
  it('defaults months to 6', () => {
    const result = inspectorEarningsSummaryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.months).toBe(6);
  });

  it('coerces string months', () => {
    const result = inspectorEarningsSummaryQuerySchema.safeParse({ months: '12' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.months).toBe(12);
  });

  it('rejects months over 24', () => {
    expect(inspectorEarningsSummaryQuerySchema.safeParse({ months: 25 }).success).toBe(false);
  });

  it('rejects months under 1', () => {
    expect(inspectorEarningsSummaryQuerySchema.safeParse({ months: 0 }).success).toBe(false);
  });

  it('rejects non-integer months', () => {
    expect(inspectorEarningsSummaryQuerySchema.safeParse({ months: 1.5 }).success).toBe(false);
  });
});

describe('startInspectionSchema / finishInspectionSchema — F03 capture fields', () => {
  const coords = { latitude: -33.86, longitude: 151.2 };

  for (const [name, schema] of [
    ['startInspectionSchema', startInspectionSchema],
    ['finishInspectionSchema', finishInspectionSchema],
  ] as const) {
    describe(name, () => {
      it('accepts coordinates only (offline item queued before F03)', () => {
        const result = schema.safeParse(coords);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.accuracy).toBeUndefined();
          expect(result.data.clientOccurredAt).toBeUndefined();
        }
      });

      it('accepts valid accuracy values', () => {
        expect(schema.safeParse({ ...coords, accuracy: 0 }).success).toBe(true);
        expect(schema.safeParse({ ...coords, accuracy: 12.4 }).success).toBe(true);
        expect(schema.safeParse({ ...coords, accuracy: 25000 }).success).toBe(true);
      });

      it('rejects invalid accuracy values', () => {
        expect(schema.safeParse({ ...coords, accuracy: -1 }).success).toBe(false);
        expect(schema.safeParse({ ...coords, accuracy: Infinity }).success).toBe(false);
        expect(schema.safeParse({ ...coords, accuracy: 'x' }).success).toBe(false);
      });

      it('accepts ISO-8601 clientOccurredAt with offset or Z', () => {
        expect(schema.safeParse({ ...coords, clientOccurredAt: '2026-11-03T09:41:12.000+11:00' }).success).toBe(true);
        expect(schema.safeParse({ ...coords, clientOccurredAt: '2026-11-02T22:41:12Z' }).success).toBe(true);
      });

      it('rejects non-ISO clientOccurredAt', () => {
        expect(schema.safeParse({ ...coords, clientOccurredAt: '2026-11-03 09:41' }).success).toBe(false);
        expect(schema.safeParse({ ...coords, clientOccurredAt: 'yesterday' }).success).toBe(false);
      });
    });
  }
});
