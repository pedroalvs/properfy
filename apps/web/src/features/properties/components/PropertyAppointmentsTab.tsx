import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import type { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDate } from '@/lib/format-date';
import { usePropertyAppointments, type PropertyAppointment } from '../hooks/usePropertyAppointments';

interface PropertyAppointmentsTabProps {
  propertyId: string;
}

export function PropertyAppointmentsTab({ propertyId }: PropertyAppointmentsTabProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, errorMessage, refetch, pagination, sorting } =
    usePropertyAppointments(propertyId);

  const handleView = useCallback(
    (apt: PropertyAppointment) => {
      navigate(`/appointments/${apt.id}`);
    },
    [navigate],
  );

  const columns: DataTableColumn<PropertyAppointment>[] = [
    {
      key: 'code',
      label: 'Code',
      width: '120px',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      sortable: true,
      render: (row) => <StatusChip status={row.status as AppointmentStatus} />,
    },
    {
      key: 'serviceTypeName',
      label: 'Service Type',
      width: '160px',
    },
    {
      key: 'scheduledDate',
      label: 'Date',
      width: '120px',
      sortable: true,
      render: (row) => <>{formatDate(row.scheduledDate)}</>,
    },
    {
      key: 'timeSlot',
      label: 'Time Slot',
      width: '120px',
    },
    {
      key: 'inspectorName',
      label: 'Inspector',
      width: '160px',
      render: (row) => <>{row.inspectorName ?? '—'}</>,
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
    <DataTable<PropertyAppointment>
      columns={columns}
      data={data}
      loading={isLoading}
      error={isError ? (errorMessage ?? 'Failed to load appointments') : undefined}
      onRetryError={refetch}
      pagination={pagination}
      sorting={sorting}
      keyExtractor={(row) => row.id}
    />
  );
}
