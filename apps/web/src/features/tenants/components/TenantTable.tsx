import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';
import type { TenantContact } from '../types';

interface TenantTableProps {
  data: TenantContact[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (contact: TenantContact) => void;
}

export function TenantTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
}: TenantTableProps) {
  const columns: DataTableColumn<TenantContact>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'primaryEmail',
      label: 'Email',
      width: '200px',
      render: (row) => <>{row.primaryEmail ?? '—'}</>,
    },
    {
      key: 'primaryPhone',
      label: 'Phone',
      width: '140px',
      render: (row) => <>{row.primaryPhone ?? '—'}</>,
    },
    {
      key: 'confirmationStatus',
      label: 'Confirmation',
      width: '160px',
      sortable: true,
      render: (row) => <TenantConfirmationStatusChip status={row.confirmationStatus} />,
    },
    {
      key: 'propertyAddress',
      label: 'Property',
    },
    {
      key: 'appointmentDate',
      label: 'Appointment Date',
      width: '140px',
      sortable: true,
      render: (row) => <>{formatDate(row.appointmentDate)}</>,
    },
    {
      key: 'lastActivityAt',
      label: 'Last Activity',
      width: '150px',
      sortable: true,
      render: (row) => (
        <>
          {row.lastActivityAt
            ? formatDate(row.lastActivityAt)
            : '—'}
        </>
      ),
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
    <DataTable<TenantContact>
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
