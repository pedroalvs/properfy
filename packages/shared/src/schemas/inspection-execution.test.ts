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
  it('should accept valid input with all fields', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
      checklistJson: { item1: true, item2: false },
      notes: 'Inspection completed successfully',
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal input with lat/lng only', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(result.success).toBe(true);
  });

  it('should reject notes longer than 5000 characters', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
      notes: 'a'.repeat(5001),
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
