import type { PushSubscriptionInput } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import { PushNotConfiguredError } from '../../domain/inspector-notice.errors';
import type { IPushSender } from '../../domain/push-sender';
import type { IPushSubscriptionRepository } from '../../domain/push-subscription.repository';

export class UpsertPushSubscriptionUseCase {
  constructor(
    private readonly repo: IPushSubscriptionRepository,
    private readonly pushSender: IPushSender,
    private readonly clock: Clock,
  ) {}

  async execute(inspectorId: string, subscription: PushSubscriptionInput): Promise<void> {
    // No point storing a subscription that can never be sent to.
    if (!this.pushSender.isEnabled()) {
      throw new PushNotConfiguredError();
    }
    await this.repo.upsert({
      inspectorId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      now: this.clock.now(),
    });
  }
}
