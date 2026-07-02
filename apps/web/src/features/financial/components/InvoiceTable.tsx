import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions, type RowAction } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { InvoiceStatusChip } from './InvoiceStatusChip';
import type { Invoice } from '../types';

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
};

interface InvoiceTableProps {
  data: Invoice[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  resolveInspectorLabel?: (inspectorId: string) => string;
  onView?: (invoice: Invoice) => void;
  onDownload?: (invoice: Invoice) => void;
  onMarkPaid?: (invoiceId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAllClosed?: () => void;
  canModifyPayments?: boolean;
}

export function InvoiceTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  resolveInspectorLabel,
  onView,
  onDownload,
  onMarkPaid,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllClosed,
  canModifyPayments = false,
}: InvoiceTableProps) {
  const closedIds = data.filter((row) => row.status === 'CLOSED').map((row) => row.id);
  const allClosedSelected =
    !!selectedIds && closedIds.length > 0 && closedIds.every((id) => selectedIds.has(id));

  const selectionColumn: DataTableColumn<Invoice>[] =
    canModifyPayments && selectedIds && onToggleSelect
      ? [
          {
            key: 'select',
            label: '',
            width: '48px',
            render: (row) => {
              const isClosed = row.status === 'CLOSED';
              return (
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  disabled={!isClosed}
                  onChange={() => onToggleSelect(row.id)}
                  className="accent-primary"
                  aria-label={isClosed ? `Select invoice ${row.id}` : undefined}
                />
              );
            },
            headerRender: onToggleSelectAllClosed
              ? () => (
                  <input
                    type="checkbox"
                    checked={!!allClosedSelected}
                    onChange={onToggleSelectAllClosed}
                    className="accent-primary"
                    aria-label="Select all closed invoices"
                    disabled={closedIds.length === 0}
                  />
                )
              : undefined,
          },
        ]
      : [];

  const columns: DataTableColumn<Invoice>[] = [
    ...selectionColumn,
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
      width: '120px',
      render: (row) => {
        const actions: RowAction[] = [
          {
            icon: 'mdi-eye-outline',
            label: 'View',
            onClick: () => onView?.(row),
          },
          {
            icon: 'mdi-download-outline',
            label: 'Download',
            onClick: () => onDownload?.(row),
            disabled: row.status === 'OPEN' || row.status === 'PENDING_REVIEW' || !row.fileKey,
          },
        ];
        if (canModifyPayments && row.status === 'CLOSED' && onMarkPaid) {
          actions.push({
            icon: 'mdi-cash-check',
            label: 'Mark as Paid',
            onClick: () => onMarkPaid(row.id),
          });
        }
        return <RowActions actions={actions} />;
      },
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
      defaultSort={{ key: 'createdAt', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
