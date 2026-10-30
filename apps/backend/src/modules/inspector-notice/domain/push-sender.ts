/**
 * Port for sending a Web Push message. Two adapters implement it: `WebPushSender`
 * (enabled when the three VAPID vars are set) and `DisabledPushSender` (otherwise).
 * The delivery use case maps outcomes to subscription state and the SMS fallback (D2-a).
 */

export type PushSendOutcome =
  | { outcome: 'SENT' }
  | { outcome: 'GONE'; statusCode: 404 | 410 }
  | { outcome: 'REJECTED'; statusCode: 401 | 403 } // VAPID invalid/rotated (L-F02-04)
  | { outcome: 'FAILED'; statusCode: number | null }
  | { outcome: 'DISABLED' };

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface InspectorNoticePushPayload {
  v: 1;
  noticeId: string;
  title: string;
  body: string;
  critical: boolean;
  url: string;
}

export interface PushSendOptions {
  ttlSeconds: number;
  urgency: 'normal' | 'high';
}

export interface IPushSender {
  isEnabled(): boolean;
  send(
    target: PushTarget,
    payload: InspectorNoticePushPayload,
    opts: PushSendOptions,
  ): Promise<PushSendOutcome>;
}
