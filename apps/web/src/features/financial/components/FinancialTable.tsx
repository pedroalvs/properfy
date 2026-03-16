import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';
import type { FinancialEntry } from '../types';

interface FinancialTableProps {
  data: FinancialEntry[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (entry: FinancialEntry) => void;
  onEdit?: (entry: FinancialEntry) => void;
}

export function FinancialTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: FinancialTableProps) {
  const columns: DataTableColumn<FinancialEntry>[] = [
    {
      key: 'appointmentCode',
      label: 'Vistoria',
      width: '120px',
      sortable: true,
    },
    {
      key: 'entryType',
      label: 'Tipo',
      width: '180px',
      sortable: true,
      render: (row) => <FinancialEntryTypeChip entryType={row.entryType} />,
    },
    {
      key: 'amount',
      label: 'Valor',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span
          style={{
            color: row.amount >= 0 ? 'var(--color-money-positive)' : 'var(--color-money-negative)',
            fontWeight: 600,
          }}
        >
          {row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
      label: 'Entidade',
      width: '160px',
    },
    {
      key: 'effectiveAt',
      label: 'Data Efetiva',
      width: '140px',
      sortable: true,
      render: (row) => <>{new Date(row.effectiveAt).toLocaleDateString('pt-BR')}</>,
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
              label: 'Visualizar',
              onClick: () => onView?.(row),
            },
            {
              icon: 'mdi-pencil-outline',
              label: 'Editar',
              onClick: () => onEdit?.(row),
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
      sorting={sorting}
      keyExtractor={(row) => row.id}
    />
  );
}
