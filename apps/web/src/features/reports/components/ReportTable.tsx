import { ReportStatus } from '@properfy/shared';
import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions, type RowAction } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { ReportTypeChip } from './ReportTypeChip';
import { ReportStatusChip } from './ReportStatusChip';
import type { Report } from '../types';

interface ReportTableProps {
  data: Report[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
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
  sorting,
  onDownload,
  onRetry,
  onView,
}: ReportTableProps) {
  const columns: DataTableColumn<Report>[] = [
    {
      key: 'reportType',
      label: 'Type',
      width: '200px',
      sortable: true,
      render: (row) => <ReportTypeChip reportType={row.reportType} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      sortable: true,
      render: (row) => <ReportStatusChip status={row.status} />,
    },
    {
      key: 'fileName',
      label: 'File',
      render: (row) => <>{row.fileName ?? '—'}</>,
    },
    {
      key: 'requestedBy',
      label: 'Requested By',
      width: '180px',
      sortable: true,
      render: (row) => <>{row.requestedBy?.name ?? '—'}</>,
    },
    {
      key: 'createdAt',
      label: 'Created At',
      width: '140px',
      sortable: true,
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
      sorting={sorting}
      keyExtractor={(row) => row.id}
    />
  );
}
