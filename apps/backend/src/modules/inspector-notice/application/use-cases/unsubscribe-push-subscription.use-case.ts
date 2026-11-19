import type { PushUnsubscribeInput } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { IPushSubscriptionRepository } from '../../domain/push-subscription.repository';

export class UnsubscribePushSubscriptionUseCase {
  constructor(
    private readonly repo: IPushSubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(inspectorId: string, input: PushUnsubscribeInput): Promise<void> {
    // Idempotent no-op when the endpoint is unknown or belongs to another inspector.
    await this.repo.unsubscribeOwn(inspectorId, input.endpoint, this.clock.now());
  }
}
