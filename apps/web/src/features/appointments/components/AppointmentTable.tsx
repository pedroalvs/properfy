import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { formatDate } from '@/lib/format-date';
import { AppointmentStatusChip } from './AppointmentStatusChip';
import { RentalTenantConfirmationChip } from './RentalTenantConfirmationChip';
import type { Appointment } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';
interface AppointmentTableProps {
  data: Appointment[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function AppointmentTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  selectedIds,
  onSelectionChange,
}: AppointmentTableProps) {
  const selectable = selectedIds !== undefined && onSelectionChange !== undefined;

  const allVisibleSelected =
    selectable && data.length > 0 && data.every((row) => selectedIds!.includes(row.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allVisibleSelected) {
      onSelectionChange(selectedIds!.filter((id) => !data.some((row) => row.id === id)));
    } else {
      const existing = new Set(selectedIds!);
      onSelectionChange([...selectedIds!, ...data.filter((row) => !existing.has(row.id)).map((row) => row.id)]);
    }
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectionColumn: DataTableColumn<Appointment> | null = selectable
    ? {
        key: '_selection',
        label: '',
        width: '48px',
        headerRender: () => (
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAll}
            className="h-4 w-4 accent-primary"
            aria-label="Select all"
          />
        ),
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedIds!.includes(row.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleRow(row.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 accent-primary"
            aria-label={`Select appointment ${row.code}`}
          />
        ),
      }
    : null;

  const columns: DataTableColumn<Appointment>[] = [
    ...(selectionColumn ? [selectionColumn] : []),
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
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span>{row.contactName}</span>
          {row.contactPhone && (
            <span className="text-xs text-text-muted">{row.contactPhone ? formatAuPhone(row.contactPhone) : row.contactPhone}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '180px',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <AppointmentStatusChip status={row.status} doneCheckedByUserId={row.doneCheckedByUserId} isOverdue={row.isOverdue} />
          {row.hasRentalTenantNote && (
            <span title="Tenant left a note">
              <i
                className="mdi mdi-note-text-outline text-base text-text-secondary"
                aria-label="Tenant left a note"
              />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'rentalTenantConfirmationStatus',
      label: 'Confirmation',
      width: '140px',
      sortable: true,
      render: (row) => <RentalTenantConfirmationChip status={row.rentalTenantConfirmationStatus} />,
    },
    {
      key: 'inspectorName',
      label: 'Inspector',
      width: '160px',
      render: (row) => <>{row.inspectorName ?? '—'}</>,
    },
    {
      key: 'serviceGroupCode',
      label: 'Group',
      width: '90px',
      render: (row) =>
        row.serviceGroupCode ? (
          <span className="font-mono text-sm text-text-secondary">{row.serviceGroupCode}</span>
        ) : (
          <>—</>
        ),
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
              to: `/appointments/${row.id}`,
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
      defaultSort={{ key: 'scheduledDate', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
