import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { InvoiceStatusChip } from './InvoiceStatusChip';
import type { Invoice } from '../types';

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
};

interface InvoiceTableProps {
  data: Invoice[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  resolveInspectorLabel?: (inspectorId: string) => string;
  onView?: (invoice: Invoice) => void;
  onDownload?: (invoice: Invoice) => void;
}

export function InvoiceTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  resolveInspectorLabel,
  onView,
  onDownload,
}: InvoiceTableProps) {
  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'inspectorId',
      label: 'Inspector',
      width: '180px',
      sortable: true,
      render: (row) => <>{resolveInspectorLabel?.(row.inspectorId) ?? row.inspectorId}</>,
    },
    {
      key: 'periodStart',
      label: 'Period',
      width: '200px',
      sortable: true,
      render: (row) => (
        <>
          {formatDate(row.periodStart)} - {formatDate(row.periodEnd)}
        </>
      ),
    },
    {
      key: 'periodType',
      label: 'Period Type',
      width: '120px',
      render: (row) => <>{FREQUENCY_LABELS[row.periodType] ?? row.periodType}</>,
    },
    {
      key: 'totalAmount',
      label: 'Total',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {row.totalAmount.toLocaleString('en-AU', { style: 'currency', currency: row.currency })}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <InvoiceStatusChip status={row.status} />,
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-eye-outline',
              label: 'View',
              onClick: () => onView?.(row),
            },
            {
              icon: 'mdi-download-outline',
              label: 'Download',
              onClick: () => onDownload?.(row),
              disabled: row.status === 'OPEN' || !row.fileKey,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<Invoice>
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
