import { ReportStatus } from '@properfy/shared';
import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions, type RowAction } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { ReportTypeChip } from './ReportTypeChip';
import { ReportStatusChip } from './ReportStatusChip';
import type { Report } from '../types';
import { getReportFileName } from '../lib/report-display';

interface ReportTableProps {
  data: Report[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onDownload?: (report: Report) => void;
  onRetry?: (report: Report) => void;
  onView?: (report: Report) => void;
}

function getRowActions(
  row: Report,
  onDownload?: (report: Report) => void,
  onRetry?: (report: Report) => void,
  onView?: (report: Report) => void,
): RowAction[] {
  if (row.status === ReportStatus.READY) {
    return [
      {
        icon: 'mdi-download-outline',
        label: 'Download',
        onClick: () => onDownload?.(row),
      },
    ];
  }

  if (row.status === ReportStatus.FAILED) {
    return [
      {
        icon: 'mdi-refresh',
        label: 'Reprocess',
        onClick: () => onRetry?.(row),
      },
    ];
  }

  return [
    {
      icon: 'mdi-eye-outline',
      label: 'View',
      onClick: () => onView?.(row),
    },
  ];
}

export function ReportTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onDownload,
  onRetry,
  onView,
}: ReportTableProps) {
  const columns: DataTableColumn<Report>[] = [
    {
      key: 'reportType',
      label: 'Type',
      width: '200px',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <ReportTypeChip reportType={row.reportType} />
          {row.scheduledReportId && (
            <a
              href={`/scheduled-reports/${row.scheduledReportId}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
              title="From scheduled report"
              data-testid="scheduled-report-chip"
            >
              <i className="mdi mdi-calendar-clock text-sm" aria-hidden="true" />
              Scheduled
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      render: (row) => <ReportStatusChip status={row.status} />,
    },
    {
      key: 'fileKey',
      label: 'File',
      render: (row) => <>{getReportFileName(row) ?? '—'}</>,
    },
    {
      key: 'requestedBy',
      label: 'Requested By',
      width: '180px',
      render: (row) => <>{row.requestedBy?.name ?? '—'}</>,
    },
    {
      key: 'createdAt',
      label: 'Created At',
      width: '140px',
      render: (row) => <>{formatDate(row.createdAt)}</>,
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => (
        <RowActions actions={getRowActions(row, onDownload, onRetry, onView)} />
      ),
    },
  ];

  return (
    <DataTable<Report>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      keyExtractor={(row) => row.id}
    />
  );
}
