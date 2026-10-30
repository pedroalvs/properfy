import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { formatInstantDateTime } from '@/lib/format-date';
import { formatAudience } from '../lib/format-audience';
import { useInspectorNoticeDetail } from '../hooks/useInspectorNoticeDetail';
import { useArchiveInspectorNotice } from '../hooks/useArchiveInspectorNotice';
import type { InspectorNoticeDetail } from '../types';

const LIST_PATH = '/inspector-notices';
const CRITICAL_CHIP = { bg: '#FFCDD2', text: 'var(--color-text-primary)' };
const ARCHIVED_CHIP = { bg: '#F5F5F5', text: 'var(--color-text-muted)' };
const MUTED_CHIP = { bg: '#F5F5F5', text: 'var(--color-text-muted)' };
const READ_CHIP = { bg: '#C8E6C9', text: 'var(--color-text-primary)' };
const UNREAD_CHIP = { bg: '#EEEEEE', text: 'var(--color-text-secondary)' };

type RecipientTab = 'all' | 'read' | 'unread';
type Recipient = InspectorNoticeDetail['recipients'][number];

export function InspectorNoticeDetailPage() {
  const { noticeId } = useParams<{ noticeId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { notice, isLoading, isError, notFound, refetch } = useInspectorNoticeDetail(noticeId ?? null);

  const [tab, setTab] = useState<RecipientTab>('all');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { archive, isArchiving } = useArchiveInspectorNotice(noticeId ?? null, () => {
    setArchiveOpen(false);
    showSuccess('Notice archived');
    refetch();
  });

  async function handleArchive() {
    try {
      await archive();
    } catch {
      // Surface the failure instead of leaving the ConfirmDialog hanging (CLAUDE.md §8);
      // the operator can reopen Archive to retry.
      setArchiveOpen(false);
      showError("Couldn't archive the notice. Try again.");
    }
  }

  const recipients = useMemo(() => notice?.recipients ?? [], [notice?.recipients]);
  const readCount = notice?.readCount ?? 0;
  const recipientCount = notice?.recipientCount ?? 0;

  // Z = unread recipients who cannot read in the app (inactive or no app access).
  const cantRead = useMemo(
    () =>
      recipients.filter((r) => r.readAt === null && (r.inspectorStatus === 'INACTIVE' || r.hasAppAccess === false))
        .length,
    [recipients],
  );

  const shownRecipients = useMemo(() => {
    if (tab === 'read') return recipients.filter((r) => r.readAt !== null);
    if (tab === 'unread') return recipients.filter((r) => r.readAt === null);
    return recipients;
  }, [recipients, tab]);

  if (isLoading) return <LoadingState />;
  if (notFound) {
    return (
      <EmptyState
        title="Notice not found"
        action={{ label: 'Back to notices', onClick: () => navigate(LIST_PATH) }}
      />
    );
  }
  if (isError || !notice) {
    return <ErrorState message="Couldn't load this notice." onRetry={refetch} />;
  }

  const readTally =
    cantRead > 0
      ? `Read by ${readCount} of ${recipientCount} (${cantRead} can't read in the app)`
      : `Read by ${readCount} of ${recipientCount}`;

  const columns: DataTableColumn<Recipient>[] = [
    {
      key: 'inspector',
      label: 'Inspector',
      render: (r) => (
        <span className="flex items-center gap-2">
          <span>{r.inspectorName}</span>
          {r.inspectorStatus === 'INACTIVE' && (
            <StatusChip label="Inactive" bg={MUTED_CHIP.bg} text={MUTED_CHIP.text} />
          )}
          {!r.hasAppAccess && <StatusChip label="No app access" bg={MUTED_CHIP.bg} text={MUTED_CHIP.text} />}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) =>
        r.readAt ? (
          <StatusChip label="Read" bg={READ_CHIP.bg} text={READ_CHIP.text} />
        ) : (
          <StatusChip label="Unread" bg={UNREAD_CHIP.bg} text={UNREAD_CHIP.text} />
        ),
    },
    {
      key: 'readAt',
      label: 'Read at',
      render: (r) => (r.readAt ? formatInstantDateTime(r.readAt, PLATFORM_TIMEZONE) : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title={notice.title}
        backTo={LIST_PATH}
        secondaryActions={
          notice.archivedAt ? [] : [{ label: 'Archive', icon: 'mdi-archive-outline', onClick: () => setArchiveOpen(true) }]
        }
      />

      <div className="flex items-center gap-2">
        {notice.critical && <StatusChip label="Critical" bg={CRITICAL_CHIP.bg} text={CRITICAL_CHIP.text} />}
        {notice.archivedAt && <StatusChip label="Archived" bg={ARCHIVED_CHIP.bg} text={ARCHIVED_CHIP.text} />}
      </div>

      {notice.archivedAt && (
        <InfoBanner variant="info" className="mt-3">
          This notice is archived. Inspectors no longer see it.
        </InfoBanner>
      )}

      <dl className="mt-4 flex flex-col gap-1 text-sm text-text-secondary">
        <div>Published {formatInstantDateTime(notice.publishedAt, PLATFORM_TIMEZONE)}</div>
        <div>By {notice.author.type === 'SYSTEM' ? 'System' : (notice.author.name ?? 'System')}</div>
        <div>Audience: {formatAudience(notice.audience)}</div>
      </dl>

      <div className="mt-4 whitespace-pre-wrap break-words rounded border border-border-light bg-card-bg p-4 text-sm text-text-primary">
        {notice.body}
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-text-primary">{readTally}</p>
        <div
          role="progressbar"
          aria-label="Read progress"
          aria-valuenow={readCount}
          aria-valuemin={0}
          aria-valuemax={recipientCount}
          className="mt-1 h-2 w-full max-w-sm rounded bg-border-light"
        >
          <span
            className="block h-2 rounded bg-success"
            style={{ width: `${recipientCount > 0 ? Math.round((readCount / recipientCount) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4">
        <TabsNav
          tabs={[
            { id: 'all', label: `All (${recipientCount})` },
            { id: 'read', label: `Read (${readCount})` },
            { id: 'unread', label: `Unread (${recipientCount - readCount})` },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as RecipientTab)}
        />
        <div className="mt-3">
          <DataTable columns={columns} data={shownRecipients} keyExtractor={(r) => r.inspectorId} emptyMessage="No recipients" />
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title="Archive this notice?"
        message="It will be removed from inspectors' announcements. It stays here and in the audit log."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="danger"
        loading={isArchiving}
        onConfirm={handleArchive}
        onClose={() => setArchiveOpen(false)}
      />
    </>
  );
}
