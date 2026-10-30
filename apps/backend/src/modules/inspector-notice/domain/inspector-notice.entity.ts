import type { InspectorNoticeAudience, SystemInspectorNoticeType } from '@properfy/shared';

/** A published inspector notice (one row of `inspector_notices`). */
export interface InspectorNoticeEntity {
  id: string;
  title: string;
  body: string;
  critical: boolean;
  audience: InspectorNoticeAudience;
  systemType: SystemInspectorNoticeType | null;
  dedupeKey: string | null;
  targetPath: string | null;
  authorUserId: string | null;
  publishedAt: Date;
  archivedAt: Date | null;
  deliveryStartedAt: Date | null;
  deliveryCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A recipient row with the inspector attributes delivery needs. */
export interface InspectorNoticeRecipientEntity {
  noticeId: string;
  inspectorId: string;
  readAt: Date | null;
  deliveryProcessedAt: Date | null;
}

export type PushSubscriptionRevokedReason =
  | 'GONE'
  | 'UNSUBSCRIBED'
  | 'REJECTED'
  | 'FAILED'
  | 'DEACTIVATED';

/** A Web Push subscription for one device (one row of `inspector_push_subscriptions`). */
export interface InspectorPushSubscriptionEntity {
  id: string;
  inspectorId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  revokedAt: Date | null;
  revokedReason: PushSubscriptionRevokedReason | null;
  failureCount: number;
}
