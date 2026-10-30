import type { PushConfigResponse } from '@properfy/shared';

/** Exposes the VAPID public key the PWA needs to subscribe, or null when push is unconfigured. */
export class GetPushConfigUseCase {
  constructor(private readonly vapidPublicKey: string | null) {}

  async execute(): Promise<PushConfigResponse> {
    return { vapidPublicKey: this.vapidPublicKey };
  }
}
