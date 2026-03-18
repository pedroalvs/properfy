import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { TenantStatusChip } from './TenantStatusChip';
import type { TenantAdmin } from '../types';

interface TenantAdminTableProps {
  data: TenantAdmin[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (tenant: TenantAdmin) => void;
}

export function TenantAdminTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
}: TenantAdminTableProps) {
  const columns: DataTableColumn<TenantAdmin>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'legalName',
      label: 'Legal Name',
      render: (row) => <>{row.legalName ?? '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <TenantStatusChip status={row.status} />,
    },
    {
      key: 'branchCount',
      label: 'Branches',
      width: '100px',
      render: (row) => <>{row.branchCount}</>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: '140px',
      sortable: true,
      render: (row) => <>{formatDate(row.createdAt)}</>,
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
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
    <DataTable<TenantAdmin>
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
