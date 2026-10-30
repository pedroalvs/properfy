import type { IPushSender, PushSendOutcome } from '../domain/push-sender';

/** Used when VAPID is not configured: every send reports DISABLED, so criticals fall back to SMS. */
export class DisabledPushSender implements IPushSender {
  isEnabled(): boolean {
    return false;
  }

  async send(): Promise<PushSendOutcome> {
    return { outcome: 'DISABLED' };
  }
}
