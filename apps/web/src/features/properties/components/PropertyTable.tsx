import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { PropertyTypeChip } from './PropertyTypeChip';
import type { Property } from '../types';

interface PropertyTableProps {
  data: Property[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (property: Property) => void;
  onEdit?: (property: Property) => void;
}

export function PropertyTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: PropertyTableProps) {
  const columns: DataTableColumn<Property>[] = [
    {
      key: 'propertyCode',
      label: 'Código',
      width: '120px',
      sortable: true,
    },
    {
      key: 'type',
      label: 'Tipo',
      width: '140px',
      sortable: true,
      render: (row) => <PropertyTypeChip type={row.type} />,
    },
    {
      key: 'street',
      label: 'Endereço',
      render: (row) => <>{row.street}, {row.suburb}</>,
    },
    {
      key: 'postcode',
      label: 'CEP',
      width: '100px',
    },
    {
      key: 'state',
      label: 'Estado',
      width: '100px',
      sortable: true,
    },
    {
      key: 'branchName',
      label: 'Filial',
      width: '140px',
      sortable: true,
      render: (row) => <>{row.branchName ?? '—'}</>,
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
    <DataTable<Property>
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
