import type { Prisma, PrismaClient } from '@prisma/client';
import type { InspectorNoticeAudience } from '@properfy/shared';
import type { InspectorNoticeEntity } from '../domain/inspector-notice.entity';
import type {
  CreateInspectorNoticeParams,
  DeliveryRecipientRow,
  IInspectorNoticeRepository,
  InspectorNoticeDetailRow,
  InspectorNoticeRecipientDetailRow,
  InspectorNoticeSummaryRow,
  ListNoticeStatus,
  MyInspectorNoticeRow,
  Tx,
  UndeliveredSweepRow,
} from '../domain/inspector-notice.repository';

type DbClient = PrismaClient | Prisma.TransactionClient;
type NoticeRow = Prisma.InspectorNoticeGetPayload<Record<string, never>>;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const NOT_STARTED_THRESHOLD_MS = 2 * 60 * 1000;
const INCOMPLETE_THRESHOLD_MS = 20 * 60 * 1000;

export class PrismaInspectorNoticeRepository implements IInspectorNoticeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Tx): DbClient {
    return tx ?? this.prisma;
  }

  async acquirePublishLock(lockKey: string, tx?: Tx): Promise<void> {
    await this.db(tx).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  async create(params: CreateInspectorNoticeParams, tx?: Tx): Promise<InspectorNoticeEntity> {
    const db = this.db(tx);
    const row = await db.inspectorNotice.create({
      data: {
        title: params.title,
        body: params.body,
        critical: params.critical,
        audience_json: params.audience as unknown as Prisma.InputJsonValue,
        system_type: params.systemType,
        dedupe_key: params.dedupeKey,
        target_path: params.targetPath,
        author_user_id: params.authorUserId,
        published_at: params.now,
        created_at: params.now,
      },
    });
    if (params.recipientInspectorIds.length > 0) {
      await db.inspectorNoticeRecipient.createMany({
        data: params.recipientInspectorIds.map((inspectorId) => ({
          notice_id: row.id,
          inspector_id: inspectorId,
          created_at: params.now,
        })),
      });
    }
    return mapNotice(row);
  }

  async findById(noticeId: string, tx?: Tx): Promise<InspectorNoticeEntity | null> {
    const row = await this.db(tx).inspectorNotice.findUnique({ where: { id: noticeId } });
    return row ? mapNotice(row) : null;
  }

  async findByDedupeKey(dedupeKey: string, tx?: Tx): Promise<InspectorNoticeEntity | null> {
    const row = await this.db(tx).inspectorNotice.findUnique({ where: { dedupe_key: dedupeKey } });
    return row ? mapNotice(row) : null;
  }

  async archiveIfActive(
    noticeId: string,
    now: Date,
  ): Promise<{ entity: InspectorNoticeEntity; changed: boolean } | null> {
    const existing = await this.prisma.inspectorNotice.findUnique({ where: { id: noticeId } });
    if (!existing) return null;
    const result = await this.prisma.inspectorNotice.updateMany({
      where: { id: noticeId, archived_at: null },
      data: { archived_at: now },
    });
    const changed = result.count > 0;
    const current = changed
      ? await this.prisma.inspectorNotice.findUnique({ where: { id: noticeId } })
      : existing;
    return { entity: mapNotice(current ?? existing), changed };
  }

  async listSummaries(params: {
    status: ListNoticeStatus;
    page: number;
    pageSize: number;
  }): Promise<{ data: InspectorNoticeSummaryRow[]; total: number }> {
    const where = statusWhere(params.status);
    const [total, rows] = await Promise.all([
      this.prisma.inspectorNotice.count({ where }),
      this.prisma.inspectorNotice.findMany({
        where,
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { author: { select: { name: true } } },
      }),
    ]);
    const ids = rows.map((r) => r.id);
    const [recipientCounts, readCounts] = await Promise.all([
      this.countRecipientsByNotice(ids, false),
      this.countRecipientsByNotice(ids, true),
    ]);
    return {
      total,
      data: rows.map((row) =>
        summaryRow(row, recipientCounts.get(row.id) ?? 0, readCounts.get(row.id) ?? 0),
      ),
    };
  }

  async getSummary(noticeId: string): Promise<InspectorNoticeSummaryRow | null> {
    const row = await this.prisma.inspectorNotice.findUnique({
      where: { id: noticeId },
      include: { author: { select: { name: true } } },
    });
    if (!row) return null;
    const [recipientCount, readCount] = await Promise.all([
      this.prisma.inspectorNoticeRecipient.count({ where: { notice_id: noticeId } }),
      this.prisma.inspectorNoticeRecipient.count({
        where: { notice_id: noticeId, read_at: { not: null } },
      }),
    ]);
    return summaryRow(row, recipientCount, readCount);
  }

  async getDetail(noticeId: string): Promise<InspectorNoticeDetailRow | null> {
    const row = await this.prisma.inspectorNotice.findUnique({
      where: { id: noticeId },
      include: {
        author: { select: { name: true } },
        recipients: {
          include: {
            inspector: { select: { name: true, status: true, deleted_at: true, user_id: true } },
          },
        },
      },
    });
    if (!row) return null;

    const recipients: InspectorNoticeRecipientDetailRow[] = row.recipients
      .map((r) => ({
        inspectorId: r.inspector_id,
        inspectorName: r.inspector.name,
        readAt: r.read_at,
        inspectorStatus:
          r.inspector.deleted_at || r.inspector.status !== 'ACTIVE'
            ? ('INACTIVE' as const)
            : ('ACTIVE' as const),
        hasAppAccess: r.inspector.user_id !== null,
      }))
      .sort(compareRecipients);

    const readCount = recipients.filter((r) => r.readAt !== null).length;
    return {
      ...summaryRow(row, recipients.length, readCount),
      recipients,
    };
  }

  async listMine(params: {
    inspectorId: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: MyInspectorNoticeRow[]; total: number }> {
    const where: Prisma.InspectorNoticeWhereInput = {
      archived_at: null,
      recipients: { some: { inspector_id: params.inspectorId } },
    };
    const [total, rows] = await Promise.all([
      this.prisma.inspectorNotice.count({ where }),
      this.prisma.inspectorNotice.findMany({
        where,
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          recipients: { where: { inspector_id: params.inspectorId }, select: { read_at: true } },
        },
      }),
    ]);
    return { total, data: rows.map((row) => myNoticeRow(row, row.recipients[0]?.read_at ?? null)) };
  }

  async getMine(inspectorId: string, noticeId: string): Promise<MyInspectorNoticeRow | null> {
    const row = await this.prisma.inspectorNotice.findFirst({
      where: {
        id: noticeId,
        archived_at: null,
        recipients: { some: { inspector_id: inspectorId } },
      },
      include: { recipients: { where: { inspector_id: inspectorId }, select: { read_at: true } } },
    });
    return row ? myNoticeRow(row, row.recipients[0]?.read_at ?? null) : null;
  }

  async countMyUnread(inspectorId: string): Promise<number> {
    return this.prisma.inspectorNoticeRecipient.count({
      where: { inspector_id: inspectorId, read_at: null, notice: { archived_at: null } },
    });
  }

  async markRead(inspectorId: string, noticeId: string, now: Date): Promise<Date | null> {
    const rec = await this.prisma.inspectorNoticeRecipient.findUnique({
      where: { notice_id_inspector_id: { notice_id: noticeId, inspector_id: inspectorId } },
      select: { read_at: true, notice: { select: { archived_at: true } } },
    });
    if (!rec || rec.notice.archived_at !== null) return null;
    if (rec.read_at) return rec.read_at;
    // First read wins (COALESCE): only set when still null.
    await this.prisma.inspectorNoticeRecipient.updateMany({
      where: { notice_id: noticeId, inspector_id: inspectorId, read_at: null },
      data: { read_at: now },
    });
    const after = await this.prisma.inspectorNoticeRecipient.findUnique({
      where: { notice_id_inspector_id: { notice_id: noticeId, inspector_id: inspectorId } },
      select: { read_at: true },
    });
    return after?.read_at ?? now;
  }

  async markDeliveryStarted(noticeId: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "inspector_notices"
         SET "delivery_started_at" = COALESCE("delivery_started_at", ${now})
       WHERE "id" = ${noticeId}`;
  }

  async markDeliveryCompleted(noticeId: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "inspector_notices"
         SET "delivery_completed_at" = COALESCE("delivery_completed_at", ${now})
       WHERE "id" = ${noticeId}`;
  }

  async listPendingDeliveryRecipients(
    noticeId: string,
    limit: number,
  ): Promise<DeliveryRecipientRow[]> {
    const rows = await this.prisma.inspectorNoticeRecipient.findMany({
      where: { notice_id: noticeId, delivery_processed_at: null },
      take: limit,
      include: { inspector: { select: { status: true, deleted_at: true, phone: true } } },
    });
    return rows.map((r) => ({
      inspectorId: r.inspector_id,
      inspectorStatus: r.inspector.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      inspectorDeleted: r.inspector.deleted_at !== null,
      phone: r.inspector.phone,
    }));
  }

  async markRecipientProcessed(noticeId: string, inspectorId: string, now: Date): Promise<void> {
    await this.prisma.inspectorNoticeRecipient.updateMany({
      where: { notice_id: noticeId, inspector_id: inspectorId, delivery_processed_at: null },
      data: { delivery_processed_at: now },
    });
  }

  async markAllPendingProcessed(noticeId: string, now: Date): Promise<number> {
    const result = await this.prisma.inspectorNoticeRecipient.updateMany({
      where: { notice_id: noticeId, delivery_processed_at: null },
      data: { delivery_processed_at: now },
    });
    return result.count;
  }

  async findUndeliveredForSweep(now: Date, limit: number): Promise<UndeliveredSweepRow[]> {
    const windowStart = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
    const notStartedBefore = new Date(now.getTime() - NOT_STARTED_THRESHOLD_MS);
    const incompleteBefore = new Date(now.getTime() - INCOMPLETE_THRESHOLD_MS);

    const rows = await this.prisma.$queryRaw<
      { id: string; recipient_count: number; pending_count: number; reason: string }[]
    >`
      SELECT n."id",
             (SELECT COUNT(*) FROM "inspector_notice_recipients" r WHERE r."notice_id" = n."id")::int AS recipient_count,
             (SELECT COUNT(*) FROM "inspector_notice_recipients" r WHERE r."notice_id" = n."id" AND r."delivery_processed_at" IS NULL)::int AS pending_count,
             CASE WHEN n."delivery_started_at" IS NULL THEN 'not_started' ELSE 'incomplete' END AS reason
        FROM "inspector_notices" n
       WHERE n."archived_at" IS NULL
         AND n."published_at" >= ${windowStart}
         AND (
           (n."delivery_started_at" IS NULL AND n."published_at" <= ${notStartedBefore})
           OR (
             n."delivery_started_at" <= ${incompleteBefore}
             AND n."delivery_completed_at" IS NULL
             AND EXISTS (
               SELECT 1 FROM "inspector_notice_recipients" r
                WHERE r."notice_id" = n."id" AND r."delivery_processed_at" IS NULL
             )
           )
         )
       ORDER BY n."published_at" ASC
       LIMIT ${limit}`;

    return rows.map((r) => ({
      id: r.id,
      recipientCount: r.recipient_count,
      pendingCount: r.pending_count,
      reason: r.reason === 'not_started' ? 'not_started' : 'incomplete',
    }));
  }

  async autoArchiveSystemOlderThan(cutoff: Date, now: Date, batchSize: number): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.prisma.inspectorNotice.findMany({
        where: { system_type: { not: null }, archived_at: null, published_at: { lt: cutoff } },
        select: { id: true },
        orderBy: { published_at: 'asc' },
        take: batchSize,
      });
      if (batch.length === 0) break;
      await this.prisma.inspectorNotice.updateMany({
        where: { id: { in: batch.map((b) => b.id) } },
        data: { archived_at: now },
      });
      total += batch.length;
      if (batch.length < batchSize) break;
    }
    return total;
  }

  async existsSystemNoticeByDedupeKeyPrefixSince(prefix: string, since: Date): Promise<boolean> {
    // Escape LIKE wildcards so a prefix containing % or _ matches only the literal.
    const escaped = prefix.replace(/([\\%_])/g, '\\$1');
    const rows = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "inspector_notices"
         WHERE "dedupe_key" LIKE ${`${escaped}%`} ESCAPE '\\'
           AND "created_at" >= ${since}
      ) AS "exists"`;
    return rows[0]?.exists ?? false;
  }

  private async countRecipientsByNotice(
    ids: string[],
    onlyRead: boolean,
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const grouped = await this.prisma.inspectorNoticeRecipient.groupBy({
      by: ['notice_id'],
      where: { notice_id: { in: ids }, ...(onlyRead ? { read_at: { not: null } } : {}) },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.notice_id, g._count._all]));
  }
}

type NoticeWithAuthor = NoticeRow & { author: { name: string } | null };

function statusWhere(status: ListNoticeStatus): Prisma.InspectorNoticeWhereInput {
  switch (status) {
    case 'active':
      return { archived_at: null };
    case 'archived':
      return { archived_at: { not: null } };
    case 'all':
      return {};
  }
}

function mapNotice(row: NoticeRow): InspectorNoticeEntity {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    critical: row.critical,
    audience: row.audience_json as unknown as InspectorNoticeAudience,
    systemType: (row.system_type as InspectorNoticeEntity['systemType']) ?? null,
    dedupeKey: row.dedupe_key,
    targetPath: row.target_path,
    authorUserId: row.author_user_id,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    deliveryStartedAt: row.delivery_started_at,
    deliveryCompletedAt: row.delivery_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summaryRow(
  row: NoticeWithAuthor,
  recipientCount: number,
  readCount: number,
): InspectorNoticeSummaryRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    critical: row.critical,
    audience: row.audience_json as unknown as InspectorNoticeAudience,
    authorUserId: row.author_user_id,
    authorName: row.author?.name ?? null,
    systemType: row.system_type,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    recipientCount,
    readCount,
  };
}

function myNoticeRow(row: NoticeRow, readAt: Date | null): MyInspectorNoticeRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    critical: row.critical,
    publishedAt: row.published_at,
    readAt,
  };
}

/** Unread first, then by name ascending (case-insensitive). */
function compareRecipients(
  a: InspectorNoticeRecipientDetailRow,
  b: InspectorNoticeRecipientDetailRow,
): number {
  const aUnread = a.readAt === null ? 0 : 1;
  const bUnread = b.readAt === null ? 0 : 1;
  if (aUnread !== bUnread) return aUnread - bUnread;
  return a.inspectorName.localeCompare(b.inspectorName, undefined, { sensitivity: 'base' });
}
