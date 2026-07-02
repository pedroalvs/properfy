import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import { InspectorNotFoundError } from '../../domain/billing.errors';
import { computeClosedPeriods, type BillingPeriod } from '../../domain/billing-period.service';

export interface GetAvailablePeriodsInput {
  inspectorId: string;
  count: number;
}

export interface GetAvailablePeriodsOutput {
  billingCycle: string;
  periods: BillingPeriod[];
}

/**
 * Returns the selectable closed periods for an inspector's billing cycle (spec 032).
 * The route restricts this to the authenticated inspector (own-only).
 */
export class GetAvailablePeriodsUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: GetAvailablePeriodsInput): Promise<GetAvailablePeriodsOutput> {
    const inspector = await this.inspectorRepo.findById(input.inspectorId);
    if (!inspector) {
      throw new InspectorNotFoundError();
    }
    const cycle = inspector.effectiveBillingCycle;
    return {
      billingCycle: cycle,
      periods: computeClosedPeriods(cycle, this.clock.now(), input.count),
    };
  }
}
