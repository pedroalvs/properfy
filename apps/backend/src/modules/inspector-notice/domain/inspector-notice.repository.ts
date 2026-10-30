import type { Prisma } from '@prisma/client';
import type { InspectorNoticeAudience } from '@properfy/shared';
import type { InspectorNoticeEntity } from './inspector-notice.entity';

export type Tx = Prisma.TransactionClient;

export interface CreateInspectorNoticeParams {
  title: string;
  body: string;
  critical: boolean;
  audience: InspectorNoticeAudience;
  systemType: string | null;
  dedupeKey: string | null;
  targetPath: string | null;
  authorUserId: string | null;
  recipientInspectorIds: string[];
  now: Date;
}

export interface InspectorNoticeSummaryRow {
  id: string;
  title: string;
  body: string;
  critical: boolean;
  audience: InspectorNoticeAudience;
  authorUserId: string | null;
  authorName: string | null;
  systemType: string | null;
  publishedAt: Date;
  archivedAt: Date | null;
  recipientCount: number;
  readCount: number;
}

export interface InspectorNoticeRecipientDetailRow {
  inspectorId: string;
  inspectorName: string;
  readAt: Date | null;
  /** current status; soft-deleted counts as INACTIVE (L-F02-09) */
  inspectorStatus: 'ACTIVE' | 'INACTIVE';
  /** inspectors.user_id IS NOT NULL (L-F02-09) */
  hasAppAccess: boolean;
}

export interface InspectorNoticeDetailRow extends InspectorNoticeSummaryRow {
  recipients: InspectorNoticeRecipientDetailRow[];
}

export interface MyInspectorNoticeRow {
  id: string;
  title: string;
  body: string;
  critical: boolean;
  publishedAt: Date;
  readAt: Date | null;
}

export interface DeliveryRecipientRow {
  inspectorId: string;
  inspectorStatus: 'ACTIVE' | 'INACTIVE';
  inspectorDeleted: boolean;
  phone: string | null;
}

export type ListNoticeStatus = 'active' | 'archived' | 'all';

export interface UndeliveredSweepRow {
  id: string;
  recipientCount: number;
  /** which sweep criterion matched: (a) never started, (b) started-incomplete */
  reason: 'not_started' | 'incomplete';
  pendingCount: number;
}

export interface IInspectorNoticeRepository {
  /**
   * Serialize concurrent publishes sharing an idempotency key: takes a transaction-scoped
   * Postgres advisory lock (`pg_advisory_xact_lock`). Must be called inside the publish tx
   * before the idempotency re-read. The in-memory fake is a no-op.
   */
  acquirePublishLock(lockKey: string, tx?: Tx): Promise<void>;

  /** Insert a notice and its recipients in one transaction. */
  create(params: CreateInspectorNoticeParams, tx?: Tx): Promise<InspectorNoticeEntity>;

  findById(noticeId: string, tx?: Tx): Promise<InspectorNoticeEntity | null>;
  findByDedupeKey(dedupeKey: string, tx?: Tx): Promise<InspectorNoticeEntity | null>;

  /** CAS archive: only flips `archived_at` when still null; returns the current entity. */
  archiveIfActive(noticeId: string, now: Date): Promise<{ entity: InspectorNoticeEntity; changed: boolean } | null>;

  listSummaries(params: {
    status: ListNoticeStatus;
    page: number;
    pageSize: number;
  }): Promise<{ data: InspectorNoticeSummaryRow[]; total: number }>;

  getDetail(noticeId: string): Promise<InspectorNoticeDetailRow | null>;

  getSummary(noticeId: string): Promise<InspectorNoticeSummaryRow | null>;

  // Inspector box
  listMine(params: {
    inspectorId: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: MyInspectorNoticeRow[]; total: number }>;
  getMine(inspectorId: string, noticeId: string): Promise<MyInspectorNoticeRow | null>;
  countMyUnread(inspectorId: string): Promise<number>;
  /** First read wins (COALESCE). Returns the readAt, or null when not a visible recipient. */
  markRead(inspectorId: string, noticeId: string, now: Date): Promise<Date | null>;

  // Delivery
  markDeliveryStarted(noticeId: string, now: Date): Promise<void>;
  markDeliveryCompleted(noticeId: string, now: Date): Promise<void>;
  /** Pending recipients (delivery_processed_at IS NULL) joined with inspector attrs, in batches. */
  listPendingDeliveryRecipients(noticeId: string, limit: number): Promise<DeliveryRecipientRow[]>;
  markRecipientProcessed(noticeId: string, inspectorId: string, now: Date): Promise<void>;
  /** Mark every still-pending recipient processed without sending (archive stop). Returns the count. */
  markAllPendingProcessed(noticeId: string, now: Date): Promise<number>;

  // Sweep
  findUndeliveredForSweep(now: Date, limit: number): Promise<UndeliveredSweepRow[]>;

  // Retention
  autoArchiveSystemOlderThan(cutoff: Date, now: Date, batchSize: number): Promise<number>;

  // F08 guard (L-F08-06)
  existsSystemNoticeByDedupeKeyPrefixSince(prefix: string, since: Date): Promise<boolean>;
}
