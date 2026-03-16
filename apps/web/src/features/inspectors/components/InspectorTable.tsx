import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { InspectorStatusChip } from './InspectorStatusChip';
import type { Inspector } from '../types';

interface InspectorTableProps {
  data: Inspector[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (inspector: Inspector) => void;
  onEdit?: (inspector: Inspector) => void;
}

export function InspectorTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: InspectorTableProps) {
  const columns: DataTableColumn<Inspector>[] = [
    {
      key: 'name',
      label: 'Nome',
      sortable: true,
    },
    {
      key: 'email',
      label: 'E-mail',
      width: '220px',
      sortable: true,
    },
    {
      key: 'phone',
      label: 'Telefone',
      width: '140px',
      render: (row) => <>{row.phone ?? '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <InspectorStatusChip status={row.status} />,
    },
    {
      key: 'regionsCount',
      label: 'Regiões',
      width: '100px',
    },
    {
      key: 'serviceTypesCount',
      label: 'Serviços',
      width: '100px',
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
    <DataTable<Inspector>
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
