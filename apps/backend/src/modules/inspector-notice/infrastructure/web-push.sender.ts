import webpush from 'web-push';
import type {
  InspectorNoticePushPayload,
  IPushSender,
  PushSendOptions,
  PushSendOutcome,
  PushTarget,
} from '../domain/push-sender';

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

const PUSH_TIMEOUT_MS = 10_000;

/**
 * Web Push sender backed by the `web-push` library. Maps the push service HTTP status to a
 * small outcome union the delivery use case acts on:
 *  - 201        → SENT
 *  - 404 / 410  → GONE      (subscription no longer exists — revoke)
 *  - 401 / 403  → REJECTED  (VAPID invalid/rotated — revoke, L-F02-04)
 *  - other / no status (network, timeout) → FAILED
 */
export class WebPushSender implements IPushSender {
  constructor(private readonly vapid: VapidConfig) {}

  isEnabled(): boolean {
    return true;
  }

  async send(
    target: PushTarget,
    payload: InspectorNoticePushPayload,
    opts: PushSendOptions,
  ): Promise<PushSendOutcome> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          TTL: opts.ttlSeconds,
          urgency: opts.urgency,
          timeout: PUSH_TIMEOUT_MS,
          vapidDetails: {
            subject: this.vapid.subject,
            publicKey: this.vapid.publicKey,
            privateKey: this.vapid.privateKey,
          },
        },
      );
      return { outcome: 'SENT' };
    } catch (error) {
      const raw = (error as { statusCode?: unknown }).statusCode;
      const statusCode = typeof raw === 'number' ? raw : null;
      if (statusCode === 404 || statusCode === 410) {
        return { outcome: 'GONE', statusCode };
      }
      if (statusCode === 401 || statusCode === 403) {
        return { outcome: 'REJECTED', statusCode };
      }
      return { outcome: 'FAILED', statusCode };
    }
  }
}
