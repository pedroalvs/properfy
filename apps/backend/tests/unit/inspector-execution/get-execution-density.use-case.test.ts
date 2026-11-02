import type { AuthContext } from '@properfy/shared';
import {
  EXECUTION_DENSITY_GRID_SCALE,
  MAX_EXECUTION_DENSITY_CELLS,
  MIN_CELL_COUNT_CL,
  MIN_CELL_COUNT_GLOBAL,
  ROLE_ACTION_MATRIX,
} from '@properfy/shared';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/shared/domain/clock';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import {
  cellCenter,
  periodToInstants,
} from '../../../src/modules/inspector-execution/domain/execution-density-grid';
import type {
  ExecutionDensityFilters,
  ExecutionDensityReader,
  ExecutionDensityRow,
  ExecutionDensityTotals,
} from '../../../src/modules/inspector-execution/domain/execution-density.reader';
import {
  EXECUTION_DENSITY_ROLES,
  GetExecutionDensityUseCase,
} from '../../../src/modules/inspector-execution/application/use-cases/get-execution-density.use-case';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

class FakeReader implements ExecutionDensityReader {
  public calls: ExecutionDensityFilters[] = [];

  constructor(
    private readonly result: { rows: ExecutionDensityRow[]; totals: ExecutionDensityTotals } = {
      rows: [],
      totals: { valid: 0, invalid: 0 },
    },
  ) {}

  async aggregate(
    filters: ExecutionDensityFilters,
  ): Promise<{ rows: ExecutionDensityRow[]; totals: ExecutionDensityTotals }> {
    this.calls.push(filters);
    return this.result;
  }
}

/** Clock fixed at 2026-11-03T14:30:00Z = 2026-11-04 01:30 in Sydney (AEDT). "Today" = 2026-11-04. */
const fixedClock: Clock = { now: () => new Date('2026-11-03T14:30:00.000Z') };

/** A valid CL preset: the last 30 days ending today (Sydney) at the fixed clock. */
const CL_PRESET = { fromDate: '2026-10-06', toDate: '2026-11-04' };

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const I1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('GetExecutionDensityUseCase — US1 (operators read aggregated density)', () => {
  it('U1: AM with no filters calls the reader with undefined scope and Sydney instants', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    expect(reader.calls).toHaveLength(1);
    const call = reader.calls[0]!;
    expect(call.tenantId).toBeUndefined();
    expect(call.inspectorId).toBeUndefined();
    expect(call).toMatchObject(periodToInstants('2026-10-01', '2026-10-30'));
    expect(call.minCellCount).toBe(MIN_CELL_COUNT_GLOBAL);
    expect(call.gridScale).toBe(EXECUTION_DENSITY_GRID_SCALE);
    expect(call.limit).toBe(MAX_EXECUTION_DENSITY_CELLS);
  });

  it('U10: assembles cells as centers in reader order with echoed metadata', async () => {
    const reader = new FakeReader({
      rows: [
        { latIndex: -33869, lngIndex: 151209, count: 3 },
        { latIndex: -33870, lngIndex: 151210, count: 1 },
      ],
      totals: { valid: 4, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    expect(result.cells).toEqual([
      { ...cellCenter({ latIndex: -33869, lngIndex: 151209 }), count: 3 },
      { ...cellCenter({ latIndex: -33870, lngIndex: 151210 }), count: 1 },
    ]);
    expect(result.cells[0]).toEqual({ lat: -33.8685, lng: 151.2095, count: 3 });
    expect(result.cells[1]).toEqual({ lat: -33.8695, lng: 151.2105, count: 1 });
    expect(result.totalExecutions).toBe(4);
    expect(result.cellCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.gridSizeDegrees).toBe(0.001);
    expect(result.fromDate).toBe('2026-10-01');
    expect(result.toDate).toBe('2026-10-30');
  });

  it('U11: truncates to MAX cells and keeps the reader total', async () => {
    const rows = Array.from({ length: MAX_EXECUTION_DENSITY_CELLS + 1 }, (_, i) => ({
      latIndex: i,
      lngIndex: i,
      count: 1,
    }));
    const reader = new FakeReader({ rows, totals: { valid: 9999, invalid: 0 } });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    expect(result.cells).toHaveLength(MAX_EXECUTION_DENSITY_CELLS);
    expect(result.cellCount).toBe(MAX_EXECUTION_DENSITY_CELLS);
    expect(result.truncated).toBe(true);
    expect(result.totalExecutions).toBe(9999);
  });

  it('U12: empty rows with invalid totals report excludedWithoutCoordinates', async () => {
    const reader = new FakeReader({ rows: [], totals: { valid: 0, invalid: 2 } });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    expect(result.cells).toEqual([]);
    expect(result.totalExecutions).toBe(0);
    expect(result.excludedWithoutCoordinates).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('U13: every cell object has exactly lat, lng, count', async () => {
    const reader = new FakeReader({
      rows: [{ latIndex: -33869, lngIndex: 151209, count: 3 }],
      totals: { valid: 3, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    for (const cell of result.cells) {
      expect(Object.keys(cell).sort()).toEqual(['count', 'lat', 'lng']);
    }
  });

  it('U14: AM and OP use minCellCount 1 in the reader and the response', async () => {
    for (const role of ['AM', 'OP'] as const) {
      const reader = new FakeReader();
      const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
      const result = await useCase.execute({
        actor: makeActor({ role }),
        query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
      });
      expect(reader.calls[0]!.minCellCount).toBe(MIN_CELL_COUNT_GLOBAL);
      expect(result.minCellCount).toBe(MIN_CELL_COUNT_GLOBAL);
    }
  });

  it('U18: an AM cell with count 1 is shown', async () => {
    const reader = new FakeReader({
      rows: [{ latIndex: 10, lngIndex: 20, count: 1 }],
      totals: { valid: 1, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
    expect(result.cells).toHaveLength(1);
  });

  it('U22: EXECUTION_DENSITY_ROLES equals the matrix roles for map.execution_density', () => {
    expect([...EXECUTION_DENSITY_ROLES].sort()).toEqual(
      [...ROLE_ACTION_MATRIX['map.execution_density']!.roles].sort(),
    );
  });
});

describe('GetExecutionDensityUseCase — US2 (agency isolation + privacy)', () => {
  it('U2: AM passes tenantId and inspectorId through to the reader', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await useCase.execute({
      actor: makeActor({ role: 'AM' }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30', tenantId: T1, inspectorId: I1 },
    });
    expect(reader.calls[0]).toMatchObject({ tenantId: T1, inspectorId: I1 });
  });

  it('U3: OP without a JWT tenant still scopes to the requested tenantId', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await useCase.execute({
      actor: makeActor({ role: 'OP', tenantId: null }),
      query: { fromDate: '2026-10-01', toDate: '2026-10-30', tenantId: T2 },
    });
    expect(reader.calls[0]!.tenantId).toBe(T2);
  });

  it('U4: CL_ADMIN scopes to its JWT tenant', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }),
      query: CL_PRESET,
    });
    expect(reader.calls[0]!.tenantId).toBe(T1);
  });

  it('U5: a CL_USER forged tenantId never widens scope', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await useCase.execute({
      actor: makeActor({ role: 'CL_USER', tenantId: T1 }),
      query: { ...CL_PRESET, tenantId: T2 },
    });
    expect(reader.calls[0]!.tenantId).toBe(T1);
  });

  it('U6: CL_ADMIN passing inspectorId is forbidden and the reader is not called', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await expect(
      useCase.execute({
        actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }),
        query: { ...CL_PRESET, inspectorId: I1 },
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    expect(reader.calls).toHaveLength(0);
  });

  it('U7: a CL_USER without a tenant in the JWT gets TENANT_SCOPE_REQUIRED', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await expect(
      useCase.execute({
        actor: makeActor({ role: 'CL_USER', tenantId: null }),
        query: CL_PRESET,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_REQUIRED' });
    expect(reader.calls).toHaveLength(0);
  });

  it('U8: INSP is forbidden before the scope helper (no 500)', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await expect(
      useCase.execute({
        actor: makeActor({ role: 'INSP', tenantId: null, inspectorId: I1 }),
        query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(reader.calls).toHaveLength(0);
  });

  it('U9: TNT is forbidden', async () => {
    const reader = new FakeReader();
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    await expect(
      useCase.execute({
        actor: makeActor({ role: 'TNT', tenantId: null }),
        query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    expect(reader.calls).toHaveLength(0);
  });

  it('U15: CL_ADMIN and CL_USER use minCellCount 3', async () => {
    for (const role of ['CL_ADMIN', 'CL_USER'] as const) {
      const reader = new FakeReader();
      const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
      const result = await useCase.execute({
        actor: makeActor({ role, tenantId: T1 }),
        query: CL_PRESET,
      });
      expect(reader.calls[0]!.minCellCount).toBe(MIN_CELL_COUNT_CL);
      expect(result.minCellCount).toBe(MIN_CELL_COUNT_CL);
    }
  });

  it('U16: a CL cell below k is dropped by the use-case re-filter (defense in depth)', async () => {
    const reader = new FakeReader({
      rows: [{ latIndex: 10, lngIndex: 20, count: 2 }],
      totals: { valid: 2, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }),
      query: CL_PRESET,
    });
    expect(result.cells).toEqual([]);
  });

  it('U17: a CL cell at exactly k is shown', async () => {
    const reader = new FakeReader({
      rows: [{ latIndex: 10, lngIndex: 20, count: 3 }],
      totals: { valid: 3, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }),
      query: CL_PRESET,
    });
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]!.count).toBe(3);
  });

  it('U19: CL totalExecutions is the full recorte, including hidden cells', async () => {
    const reader = new FakeReader({
      rows: [{ latIndex: 10, lngIndex: 20, count: 3 }],
      totals: { valid: 5, invalid: 0 },
    });
    const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
    const result = await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }),
      query: CL_PRESET,
    });
    expect(result.totalExecutions).toBe(5);
  });

  it('U20: a CL non-preset period is rejected with PERIOD_NOT_A_PRESET and the reader is not called', async () => {
    const nonPresets = [
      { fromDate: '2026-10-01', toDate: '2026-10-10' }, // arbitrary window
      { fromDate: '2026-10-06', toDate: '2026-11-03' }, // 30 days ending yesterday
      { fromDate: '2026-10-05', toDate: '2026-11-04' }, // 31 days ending today
    ];
    for (const query of nonPresets) {
      const reader = new FakeReader();
      const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
      const error = await useCase
        .execute({ actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }), query })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toMatchObject({
        reason: 'PERIOD_NOT_A_PRESET',
        allowedDays: [7, 30, 90],
      });
      expect(reader.calls).toHaveLength(0);
    }
  });

  it('U21: the CL presets ending today are accepted', async () => {
    const presets = [
      { fromDate: '2026-10-29', toDate: '2026-11-04' }, // 7
      { fromDate: '2026-10-06', toDate: '2026-11-04' }, // 30
      { fromDate: '2026-08-07', toDate: '2026-11-04' }, // 90
    ];
    for (const query of presets) {
      const reader = new FakeReader();
      const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
      await useCase.execute({ actor: makeActor({ role: 'CL_ADMIN', tenantId: T1 }), query });
      expect(reader.calls).toHaveLength(1);
    }
  });

  it('U21a: AM/OP may request windows differing by one day (no CL preset guard)', async () => {
    for (const role of ['AM', 'OP'] as const) {
      for (const query of [
        { fromDate: '2026-10-01', toDate: '2026-10-10' },
        { fromDate: '2026-10-01', toDate: '2026-10-11' },
      ]) {
        const reader = new FakeReader();
        const useCase = new GetExecutionDensityUseCase(reader, fixedClock);
        await useCase.execute({ actor: makeActor({ role }), query });
        expect(reader.calls).toHaveLength(1);
      }
    }
  });
});
