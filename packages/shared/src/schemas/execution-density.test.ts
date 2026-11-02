import { describe, expect, it } from 'vitest';
import {
  EXECUTION_DENSITY_GRID_DEGREES,
  EXECUTION_DENSITY_GRID_SCALE,
  EXECUTION_DENSITY_PRESET_DAYS,
  MAX_EXECUTION_DENSITY_CELLS,
  MAX_EXECUTION_DENSITY_PERIOD_DAYS,
  MIN_CELL_COUNT_CL,
  MIN_CELL_COUNT_GLOBAL,
  executionDensityQuerySchema,
  executionDensityResponseSchema,
  isExecutionDensityPreset,
} from './execution-density';

describe('executionDensityQuerySchema', () => {
  it('S1: accepts a valid period with tenantId/inspectorId undefined', () => {
    const parsed = executionDensityQuerySchema.parse({
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
    });
    expect(parsed.fromDate).toBe('2026-10-01');
    expect(parsed.toDate).toBe('2026-10-30');
    expect(parsed.tenantId).toBeUndefined();
    expect(parsed.inspectorId).toBeUndefined();
  });

  it('S2: rejects a missing fromDate', () => {
    const result = executionDensityQuerySchema.safeParse({ toDate: '2026-10-30' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'fromDate')).toBe(true);
    }
  });

  it('S3: rejects an impossible calendar date', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2026-02-31',
      toDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Invalid calendar date')).toBe(true);
    }
  });

  it('S4: rejects toDate < fromDate on toDate', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2026-10-30',
      toDate: '2026-10-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'toDate');
      expect(issue?.message).toBe('toDate must be >= fromDate');
    }
  });

  it('S5: accepts a 366-day inclusive period', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2025-10-31',
      toDate: '2026-10-31',
    });
    expect(result.success).toBe(true);
  });

  it('S6: rejects a 367-day period on toDate', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2025-10-30',
      toDate: '2026-10-31',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'toDate');
      expect(issue?.message).toBe('Period must not exceed 366 days');
    }
  });

  it('S7: rejects a non-uuid tenantId', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
      tenantId: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('S8: rejects an empty-string inspectorId', () => {
    const result = executionDensityQuerySchema.safeParse({
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
      inspectorId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('executionDensityResponseSchema', () => {
  it('S9: accepts a valid response', () => {
    const result = executionDensityResponseSchema.safeParse({
      cells: [{ lat: -33.8685, lng: 151.2095, count: 3 }],
      totalExecutions: 3,
      cellCount: 1,
      excludedWithoutCoordinates: 0,
      gridSizeDegrees: 0.001,
      minCellCount: 3,
      truncated: false,
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
    });
    expect(result.success).toBe(true);
  });

  it('S10: rejects a cell count of 0 or 1.5', () => {
    const base = {
      totalExecutions: 0,
      cellCount: 1,
      excludedWithoutCoordinates: 0,
      gridSizeDegrees: 0.001,
      minCellCount: 1,
      truncated: false,
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
    };
    expect(
      executionDensityResponseSchema.safeParse({
        ...base,
        cells: [{ lat: 1, lng: 1, count: 0 }],
      }).success,
    ).toBe(false);
    expect(
      executionDensityResponseSchema.safeParse({
        ...base,
        cells: [{ lat: 1, lng: 1, count: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it('S12: rejects a missing or zero minCellCount', () => {
    const base = {
      cells: [],
      totalExecutions: 0,
      cellCount: 0,
      excludedWithoutCoordinates: 0,
      gridSizeDegrees: 0.001,
      truncated: false,
      fromDate: '2026-10-01',
      toDate: '2026-10-30',
    };
    expect(executionDensityResponseSchema.safeParse(base).success).toBe(false);
    expect(executionDensityResponseSchema.safeParse({ ...base, minCellCount: 0 }).success).toBe(
      false,
    );
  });
});

describe('execution density constants', () => {
  it('S11: exports the grid, period, cell and k constants', () => {
    expect(EXECUTION_DENSITY_GRID_SCALE).toBe(1000);
    expect(EXECUTION_DENSITY_GRID_DEGREES).toBe(0.001);
    expect(EXECUTION_DENSITY_GRID_DEGREES).toBe(1 / EXECUTION_DENSITY_GRID_SCALE);
    expect(MAX_EXECUTION_DENSITY_PERIOD_DAYS).toBe(366);
    expect(MAX_EXECUTION_DENSITY_CELLS).toBe(5000);
    expect(MIN_CELL_COUNT_CL).toBe(3);
    expect(MIN_CELL_COUNT_GLOBAL).toBe(1);
  });

  it('S13: exports EXECUTION_DENSITY_PRESET_DAYS as [7, 30, 90]', () => {
    expect(EXECUTION_DENSITY_PRESET_DAYS).toEqual([7, 30, 90]);
  });
});

describe('isExecutionDensityPreset', () => {
  it('S14: true for the 7/30/90-day presets ending today', () => {
    const today = '2026-11-04';
    expect(isExecutionDensityPreset({ fromDate: '2026-10-06', toDate: '2026-11-04' }, today)).toBe(
      true,
    ); // 30
    expect(isExecutionDensityPreset({ fromDate: '2026-10-29', toDate: '2026-11-04' }, today)).toBe(
      true,
    ); // 7
    expect(isExecutionDensityPreset({ fromDate: '2026-08-07', toDate: '2026-11-04' }, today)).toBe(
      true,
    ); // 90
  });

  it('S15: false for a 31-day window and for a window not ending today', () => {
    expect(
      isExecutionDensityPreset({ fromDate: '2026-10-05', toDate: '2026-11-04' }, '2026-11-04'),
    ).toBe(false); // 31 days
    expect(
      isExecutionDensityPreset({ fromDate: '2026-10-06', toDate: '2026-11-03' }, '2026-11-04'),
    ).toBe(false); // does not end today
  });
});
