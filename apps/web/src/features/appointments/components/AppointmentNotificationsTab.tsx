import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { useAppointmentNotifications, type AppointmentNotification } from '../hooks/useAppointmentNotifications';

interface AppointmentNotificationsTabProps {
  appointmentId: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const NOTIFICATION_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SENT: { bg: '#C8E6C9', text: 'rgba(0,0,0,0.87)' },
  PENDING: { bg: '#FFE0B2', text: 'rgba(0,0,0,0.87)' },
  FAILED: { bg: '#FFCDD2', text: 'rgba(0,0,0,0.87)' },
  DELIVERED: { bg: '#B3E5FC', text: 'rgba(0,0,0,0.87)' },
};

const columns: DataTableColumn<AppointmentNotification>[] = [
  { key: 'channel', label: 'Channel', width: '100px' },
  { key: 'recipient', label: 'Recipient' },
  {
    key: 'status',
    label: 'Status',
    width: '120px',
    render: (row) => {
      const colors = NOTIFICATION_STATUS_COLORS[row.status] ?? { bg: '#E0E0E0', text: 'rgba(0,0,0,0.87)' };
      return (
        <span
          className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {row.status}
        </span>
      );
    },
  },
  {
    key: 'sentAt',
    label: 'Sent At',
    width: '180px',
    render: (row) => formatDateTime(row.sentAt),
  },
];

export function AppointmentNotificationsTab({ appointmentId }: AppointmentNotificationsTabProps) {
  const { notifications, isLoading, isError, refetch } = useAppointmentNotifications(appointmentId);

  return (
    <DataTable
      columns={columns}
      data={notifications}
      loading={isLoading}
      error={isError ? 'Failed to load notifications' : undefined}
      onRetryError={refetch}
      emptyMessage="No notifications sent for this appointment"
      keyExtractor={(row) => row.id}
    />
  );
}
