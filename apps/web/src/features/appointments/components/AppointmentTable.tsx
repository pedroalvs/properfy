import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { formatDate } from '@/lib/format-date';
import { AppointmentStatusChip } from './AppointmentStatusChip';
import { TenantConfirmationChip } from './TenantConfirmationChip';
import type { Appointment } from '../types';
import { isAppointmentEditable } from '../lib/editability';

interface AppointmentTableProps {
  data: Appointment[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (appointment: Appointment) => void;
  onEdit?: (appointment: Appointment) => void;
}

export function AppointmentTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  onEdit,
}: AppointmentTableProps) {
  const columns: DataTableColumn<Appointment>[] = [
    {
      key: 'code',
      label: 'Code',
      width: '140px',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span>{row.code}</span>
          <span className="text-xs text-text-muted">#{row.appointmentNumber}</span>
        </div>
      ),
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
      render: (row) => <AppointmentStatusChip status={row.status} doneCheckedByUserId={row.doneCheckedByUserId} isOverdue={row.isOverdue} />,
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
      key: 'doneCheckedByUserId',
      label: 'Reviewed',
      width: '100px',
      render: (row) => (
        row.status === 'DONE'
          ? <BooleanIcon value={!!row.doneCheckedByUserId} />
          : <>—</>
      ),
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
            ...(onEdit && isAppointmentEditable(row.status)
              ? [{
                  icon: 'mdi-pencil-outline',
                  label: 'Edit',
                  onClick: () => onEdit(row),
                }]
              : []),
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
      defaultSort={{ key: 'scheduledDate', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
