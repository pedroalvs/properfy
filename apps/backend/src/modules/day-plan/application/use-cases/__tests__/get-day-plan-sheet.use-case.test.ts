import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext, DayPlanResponse } from '@properfy/shared';
import { GetDayPlanSheetUseCase } from '../get-day-plan-sheet.use-case';
import type { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import type { GetDayPlanForOperatorUseCase } from '../get-day-plan-for-operator.use-case';
import type { DayPlanSheetRenderer } from '../../../infrastructure/day-plan-sheet.renderer';
import type { AuditService } from '../../../../../shared/domain/audit';

// 2026-11-05 ~midday Sydney.
const FIXED = new Date('2026-11-05T01:00:00.000Z');

const PLAN = {
  id: '99999999-9999-4999-8999-999999999999',
  inspectorName: 'Jane Smith',
  stops: [{}, {}, {}],
} as unknown as DayPlanResponse;

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: 'insp-1',
    ...overrides,
  };
}

describe('GetDayPlanSheetUseCase', () => {
  let getMyDayPlan: { execute: ReturnType<typeof vi.fn> };
  let getForOperator: { execute: ReturnType<typeof vi.fn> };
  let renderer: { render: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let useCase: GetDayPlanSheetUseCase;

  beforeEach(() => {
    getMyDayPlan = { execute: vi.fn().mockResolvedValue(PLAN) };
    getForOperator = { execute: vi.fn().mockResolvedValue(PLAN) };
    renderer = { render: vi.fn().mockResolvedValue(Buffer.from('%PDF-data')) };
    audit = { log: vi.fn() };
    useCase = new GetDayPlanSheetUseCase(
      getMyDayPlan as unknown as GetMyDayPlanUseCase,
      getForOperator as unknown as GetDayPlanForOperatorUseCase,
      renderer as unknown as DayPlanSheetRenderer,
      audit as unknown as AuditService,
      { now: () => FIXED },
    );
  });

  it('renders the inspector PDF via the own-plan read and audits the export', async () => {
    const result = await useCase.execute({ actor: makeActor(), date: '2026-11-05', format: 'pdf' });

    expect(getMyDayPlan.execute).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: 'insp-1', date: '2026-11-05' }),
    );
    expect(getForOperator.execute).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(PLAN, 'pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('route-jane-smith-2026-11-05.pdf');
    expect(result.buffer.toString()).toBe('%PDF-data');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'day_plan.exported',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'DayPlan',
        entityId: PLAN.id,
        tenantId: null,
        metadata: { format: 'pdf', date: '2026-11-05', stops: 3, actorRole: 'INSP' },
      }),
    );
  });

  it('allows an inspector sheet exactly 30 days old', async () => {
    await expect(
      useCase.execute({ actor: makeActor(), date: '2026-10-06', format: 'pdf' }),
    ).resolves.toBeDefined();
    expect(getMyDayPlan.execute).toHaveBeenCalled();
  });

  it('rejects an inspector sheet older than 30 days and neither reads nor audits', async () => {
    await expect(
      useCase.execute({ actor: makeActor(), date: '2026-10-05', format: 'pdf' }),
    ).rejects.toMatchObject({ code: 'DAY_PLAN_SHEET_TOO_OLD' });
    expect(getMyDayPlan.execute).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('renders the AM/OP XLSX via the operator read with no date limit', async () => {
    const result = await useCase.execute({
      actor: makeActor({ role: 'OP', inspectorId: null, userId: 'op-1' }),
      date: '2020-01-01',
      format: 'xlsx',
      inspectorId: 'insp-9',
    });

    expect(getForOperator.execute).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: 'insp-9', date: '2020-01-01' }),
    );
    expect(getMyDayPlan.execute).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(PLAN, 'xlsx');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.filename).toBe('route-jane-smith-2020-01-01.xlsx');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { format: 'xlsx', date: '2020-01-01', stops: 3, actorRole: 'OP' },
      }),
    );
  });
});
