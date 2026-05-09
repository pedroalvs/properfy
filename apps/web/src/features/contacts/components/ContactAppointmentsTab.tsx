import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import type { AppointmentStatus } from '@properfy/shared';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { formatDate } from '@/lib/format-date';
import { useContactAppointments } from '../hooks/useContactAppointments';
import type { ContactAppointmentItem } from '../types';

interface ContactAppointmentsTabProps {
  contactId: string;
  /** Lazy fetch: tab activates this only when visible (NFR-103/104). */
  enabled?: boolean;
}

export function ContactAppointmentsTab({ contactId, enabled }: ContactAppointmentsTabProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, errorMessage, refetch, pagination } =
    useContactAppointments(contactId, { enabled });

  const handleView = useCallback(
    (apt: ContactAppointmentItem) => {
      navigate(`/appointments/${apt.appointmentId}`);
    },
    [navigate],
  );

  const columns: DataTableColumn<ContactAppointmentItem>[] = [
    {
      key: 'appointmentNumber',
      label: 'Code',
      width: '110px',
      render: (row) => <>#{row.appointmentNumber}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      render: (row) => <AppointmentStatusChip status={row.status as AppointmentStatus} />,
    },
    {
      key: 'scheduledDate',
      label: 'Date',
      width: '120px',
      render: (row) => <>{formatDate(row.scheduledDate)}</>,
    },
    {
      key: 'role',
      label: 'Role',
      width: '160px',
    },
    {
      key: 'isPrimary',
      label: 'Primary',
      width: '100px',
      render: (row) => row.isPrimary ? (
        <span
          className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
          style={{ backgroundColor: 'var(--color-status-scheduled)', color: 'var(--color-text-primary)' }}
          aria-label="Primary contact for this appointment"
        >
          Primary
        </span>
      ) : <span>—</span>,
    },
    {
      key: 'propertyCode',
      label: 'Property',
      width: '120px',
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
              onClick: () => handleView(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<ContactAppointmentItem>
      columns={columns}
      data={data}
      loading={isLoading}
      error={isError ? (errorMessage ?? 'Failed to load appointments') : undefined}
      onRetryError={refetch}
      pagination={pagination}
      keyExtractor={(row) => row.appointmentId}
    />
  );
}
