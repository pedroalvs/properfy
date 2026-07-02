import { describe, it, expect, vi } from 'vitest';
import { GetAvailablePeriodsUseCase } from '../../../src/modules/billing/application/use-cases/get-available-periods.use-case';
import { InspectorNotFoundError } from '../../../src/modules/billing/domain/billing.errors';
import { FakeClock } from '../../helpers/fake-clock';

const NOW = new Date('2026-07-15T02:00:00.000Z'); // 2026-07-15 in Australia/Sydney

function inspectorRepoReturning(inspector: unknown) {
  return { findById: vi.fn().mockResolvedValue(inspector) } as any;
}

describe('GetAvailablePeriodsUseCase', () => {
  it('returns the most recent closed periods for the inspector cycle', async () => {
    const uc = new GetAvailablePeriodsUseCase(
      inspectorRepoReturning({ effectiveBillingCycle: 'MONTHLY' }),
      new FakeClock(NOW),
    );
    const result = await uc.execute({ inspectorId: 'insp-1', count: 2 });
    expect(result.billingCycle).toBe('MONTHLY');
    expect(result.periods).toEqual([
      { periodType: 'MONTHLY', periodStart: '2026-06-01', periodEnd: '2026-06-30' },
      { periodType: 'MONTHLY', periodStart: '2026-05-01', periodEnd: '2026-05-31' },
    ]);
  });

  it('uses the inspector effective billing cycle to compute the closed periods', async () => {
    // (The FORTNIGHTLY default-when-unset fallback lives in the entity's effectiveBillingCycle
    // getter and is covered by the entity tests; here we assert the use case honours whatever it
    // returns.)
    const uc = new GetAvailablePeriodsUseCase(
      inspectorRepoReturning({ effectiveBillingCycle: 'FORTNIGHTLY' }),
      new FakeClock(NOW),
    );
    const result = await uc.execute({ inspectorId: 'insp-1', count: 1 });
    expect(result.billingCycle).toBe('FORTNIGHTLY');
    expect(result.periods[0]).toEqual({ periodType: 'FORTNIGHTLY', periodStart: '2026-06-29', periodEnd: '2026-07-12' });
  });

  it('throws when the inspector does not exist', async () => {
    const uc = new GetAvailablePeriodsUseCase(inspectorRepoReturning(null), new FakeClock(NOW));
    await expect(uc.execute({ inspectorId: 'missing', count: 6 })).rejects.toBeInstanceOf(InspectorNotFoundError);
  });
});
