import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { AppointmentStatusChip } from './AppointmentStatusChip';
import { TenantConfirmationChip } from './TenantConfirmationChip';
import type { Appointment } from '../types';

interface AppointmentTableProps {
  data: Appointment[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (appointment: Appointment) => void;
  onEdit?: (appointment: Appointment) => void;
}

export function AppointmentTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: AppointmentTableProps) {
  const columns: DataTableColumn<Appointment>[] = [
    {
      key: 'code',
      label: 'Code',
      width: '120px',
      sortable: true,
    },
    {
      key: 'propertyAddress',
      label: 'Address',
    },
    {
      key: 'contactName',
      label: 'Tenant',
      width: '160px',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      width: '160px',
      sortable: true,
      render: (row) => <AppointmentStatusChip status={row.status} />,
    },
    {
      key: 'tenantConfirmationStatus',
      label: 'Confirmation',
      width: '140px',
      sortable: true,
      render: (row) => <TenantConfirmationChip status={row.tenantConfirmationStatus} />,
    },
    {
      key: 'inspectorName',
      label: 'Inspector',
      width: '160px',
      render: (row) => <>{row.inspectorName ?? '—'}</>,
    },
    {
      key: 'scheduledDate',
      label: 'Scheduled Date',
      width: '140px',
      sortable: true,
      render: (row) => <>{formatDate(row.scheduledDate)}</>,
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
              icon: 'mdi-pencil-outline',
              label: 'Edit',
              onClick: () => onEdit?.(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<Appointment>
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
