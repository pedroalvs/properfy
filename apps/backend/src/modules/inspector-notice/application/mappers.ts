import type {
  InspectorNoticeDetail,
  InspectorNoticeSummary,
  MyInspectorNotice,
} from '@properfy/shared';
import type {
  InspectorNoticeDetailRow,
  InspectorNoticeSummaryRow,
  MyInspectorNoticeRow,
} from '../domain/inspector-notice.repository';

function authorOf(row: {
  authorUserId: string | null;
  authorName: string | null;
}): InspectorNoticeSummary['author'] {
  return row.authorUserId === null
    ? { type: 'SYSTEM', name: null }
    : { type: 'USER', name: row.authorName };
}

export function toSummary(row: InspectorNoticeSummaryRow): InspectorNoticeSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    critical: row.critical,
    audience: row.audience,
    author: authorOf(row),
    publishedAt: row.publishedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    recipientCount: row.recipientCount,
    readCount: row.readCount,
  };
}

export function toDetail(row: InspectorNoticeDetailRow): InspectorNoticeDetail {
  return {
    ...toSummary(row),
    recipients: row.recipients.map((r) => ({
      inspectorId: r.inspectorId,
      inspectorName: r.inspectorName,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      inspectorStatus: r.inspectorStatus,
      hasAppAccess: r.hasAppAccess,
    })),
  };
}

export function toMyNotice(row: MyInspectorNoticeRow): MyInspectorNotice {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    critical: row.critical,
    publishedAt: row.publishedAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}
