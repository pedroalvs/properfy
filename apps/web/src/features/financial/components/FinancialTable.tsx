import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';
import type { FinancialEntry } from '../types';

interface FinancialTableProps {
  data: FinancialEntry[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (entry: FinancialEntry) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllPending?: () => void;
}

export function FinancialTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  selectedIds,
  onToggleSelect,
  onSelectAllPending,
}: FinancialTableProps) {
  const pendingIds = data.filter((e) => e.status === 'PENDING').map((e) => e.id);
  const allPendingSelected = selectedIds && pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));

  const selectionColumn: DataTableColumn<FinancialEntry>[] =
    selectedIds && onToggleSelect
      ? [
          {
            key: 'select',
            label: '',
            width: '48px',
            render: (row) => {
              const isPending = row.status === 'PENDING';
              return (
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  disabled={!isPending}
                  onChange={() => onToggleSelect(row.id)}
                  className="accent-primary"
                  aria-label={isPending ? `Select ${row.appointmentCode ?? row.description ?? 'entry'}` : undefined}
                />
              );
            },
            headerRender: onSelectAllPending
              ? () => (
                  <input
                    type="checkbox"
                    checked={!!allPendingSelected}
                    onChange={onSelectAllPending}
                    className="accent-primary"
                    aria-label="Select all pending entries"
                    disabled={pendingIds.length === 0}
                  />
                )
              : undefined,
          },
        ]
      : [];

  const columns: DataTableColumn<FinancialEntry>[] = [
    ...selectionColumn,
    {
      key: 'appointmentCode',
      label: 'Inspection',
      width: '120px',
      sortable: true,
    },
    {
      key: 'entryType',
      label: 'Type',
      width: '180px',
      sortable: true,
      render: (row) => <FinancialEntryTypeChip entryType={row.entryType} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span
          style={{
            color: row.amount >= 0 ? 'var(--color-money-positive)' : 'var(--color-money-negative)',
            fontWeight: 600,
          }}
        >
          {row.amount.toLocaleString('en-AU', { style: 'currency', currency: row.currency })}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      sortable: true,
      render: (row) => <FinancialStatusChip status={row.status} />,
    },
    {
      key: 'relatedEntityName',
      label: 'Entity',
      width: '160px',
    },
    {
      key: 'effectiveAt',
      label: 'Effective Date',
      width: '140px',
      sortable: true,
      render: (row) => <>{formatDate(row.effectiveAt)}</>,
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
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<FinancialEntry>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      defaultSort={{ key: 'effectiveAt', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
