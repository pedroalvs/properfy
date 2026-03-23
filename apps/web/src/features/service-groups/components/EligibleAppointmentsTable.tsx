import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import type { AppointmentStatus } from '@properfy/shared';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { formatDate } from '@/lib/format-date';

export interface EligibleAppointment {
  id: string;
  code: string;
  propertyAddress: string;
  scheduledDate: string;
  status: AppointmentStatus;
}

interface EligibleAppointmentsTableProps {
  appointments: EligibleAppointment[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading?: boolean;
}

export function EligibleAppointmentsTable({
  appointments,
  selectedIds,
  onSelectionChange,
  loading = false,
}: EligibleAppointmentsTableProps) {
  const allSelected = appointments.length > 0 && selectedIds.length === appointments.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < appointments.length;

  function handleToggleAll() {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(appointments.map((a) => a.id));
    }
  }

  function handleToggle(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  const columns: DataTableColumn<EligibleAppointment>[] = [
    {
      key: 'checkbox',
      label: '',
      width: '48px',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => handleToggle(row.id)}
          aria-label={`Select ${row.code}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      ),
    },
    {
      key: 'code',
      label: 'Code',
      width: '130px',
    },
    {
      key: 'propertyAddress',
      label: 'Address',
    },
    {
      key: 'scheduledDate',
      label: 'Scheduled Date',
      width: '150px',
      render: (row) => <>{formatDate(row.scheduledDate)}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '160px',
      render: (row) => <AppointmentStatusChip status={row.status} />,
    },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={handleToggleAll}
          aria-label="Select all appointments"
          className="h-4 w-4 cursor-pointer accent-primary"
        />
        <span className="text-sm text-text-secondary">Select all</span>
      </div>
      <DataTable<EligibleAppointment>
        columns={columns}
        data={appointments}
        loading={loading}
        emptyMessage="No eligible appointments found"
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
