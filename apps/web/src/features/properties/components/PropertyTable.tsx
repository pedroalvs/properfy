import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { PropertyTypeChip } from './PropertyTypeChip';
import type { Property } from '../types';

interface PropertyTableProps {
  data: Property[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (property: Property) => void;
}

export function PropertyTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
}: PropertyTableProps) {
  const columns: DataTableColumn<Property>[] = [
    {
      key: 'propertyCode',
      label: 'Code',
      width: '120px',
      sortable: true,
    },
    {
      key: 'type',
      label: 'Type',
      width: '140px',
      sortable: true,
      render: (row) => <PropertyTypeChip type={row.type} />,
    },
    {
      key: 'street',
      label: 'Address',
      render: (row) => <>{row.street}, {row.suburb}</>,
    },
    {
      key: 'postcode',
      label: 'Postcode',
      width: '100px',
    },
    {
      key: 'state',
      label: 'State',
      width: '100px',
      sortable: true,
    },
    {
      key: 'branchName',
      label: 'Branch',
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
              label: 'View',
              onClick: () => onView?.(row),
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
      defaultSort={{ key: 'propertyCode', order: 'asc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
