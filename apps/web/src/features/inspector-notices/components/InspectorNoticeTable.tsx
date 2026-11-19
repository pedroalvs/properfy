import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatInstantDateTime } from '@/lib/format-date';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { formatAudience } from '../lib/format-audience';
import type { InspectorNoticeSummary } from '../types';

export interface InspectorNoticeTableProps {
  data: InspectorNoticeSummary[];
  loading: boolean;
  error?: string;
  onRetryError: () => void;
  pagination: DataTablePagination;
  onOpen: (id: string) => void;
  emptyMessage?: string;
}

// Design-token chip palette (AA on the lighten backgrounds, dark text).
const CRITICAL_CHIP = { bg: '#FFCDD2', text: 'var(--color-text-primary)' };
const ACTIVE_CHIP = { bg: '#E0E0E0', text: 'var(--color-text-primary)' };
const ARCHIVED_CHIP = { bg: '#F5F5F5', text: 'var(--color-text-muted)' };

export function InspectorNoticeTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onOpen,
  emptyMessage = 'No notices yet',
}: InspectorNoticeTableProps) {
  const columns: DataTableColumn<InspectorNoticeSummary>[] = [
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="truncate text-left font-semibold text-secondary hover:underline"
            title={row.title}
            aria-label={`Open notice ${row.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.id);
            }}
          >
            {row.title}
          </button>
          {row.critical && <StatusChip label="Critical" bg={CRITICAL_CHIP.bg} text={CRITICAL_CHIP.text} />}
        </span>
      ),
    },
    { key: 'audience', label: 'Audience', render: (row) => formatAudience(row.audience) },
    {
      key: 'published',
      label: 'Published',
      render: (row) => formatInstantDateTime(row.publishedAt, PLATFORM_TIMEZONE),
    },
    {
      key: 'author',
      label: 'Author',
      render: (row) => (row.author.type === 'SYSTEM' ? 'System' : (row.author.name ?? 'System')),
    },
    {
      key: 'read',
      label: 'Read',
      render: (row) => {
        const pct = row.recipientCount > 0 ? Math.round((row.readCount / row.recipientCount) * 100) : 0;
        return (
          <span className="flex flex-col gap-1">
            <span>
              {row.readCount}/{row.recipientCount}
            </span>
            <span className="h-1 w-16 rounded bg-border-light" aria-hidden="true">
              <span className="block h-1 rounded bg-success" style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) =>
        row.archivedAt ? (
          <StatusChip label="Archived" bg={ARCHIVED_CHIP.bg} text={ARCHIVED_CHIP.text} />
        ) : (
          <StatusChip label="Active" bg={ACTIVE_CHIP.bg} text={ACTIVE_CHIP.text} />
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      onRowClick={(row) => onOpen(row.id)}
      emptyMessage={emptyMessage}
      keyExtractor={(row) => row.id}
    />
  );
}
