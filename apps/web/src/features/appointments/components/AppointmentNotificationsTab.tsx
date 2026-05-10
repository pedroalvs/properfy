import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { NOTIFICATION_STATUS_MAP } from '@/lib/status-colors';
import { formatDateTime } from '@/lib/format-date';
import { useAppointmentNotifications, type AppointmentNotification } from '../hooks/useAppointmentNotifications';

interface AppointmentNotificationsTabProps {
  appointmentId: string;
}

function formatDateTimeOrDash(iso: string | null): string {
  if (!iso) return '\u2014';
  return formatDateTime(iso);
}

const columns: DataTableColumn<AppointmentNotification>[] = [
  { key: 'templateCode', label: 'Template', width: '180px' },
  { key: 'channel', label: 'Channel', width: '100px' },
  { key: 'recipient', label: 'Recipient' },
  {
    key: 'status',
    label: 'Status',
    width: '120px',
    render: (row) => {
      // UX-baseline cleanup: render via the shared `StatusChip` driven by
      // `NOTIFICATION_STATUS_MAP` (status-colors.ts). Pre-fix used a
      // local hex map, divergent from the rest of the design system.
      const style = NOTIFICATION_STATUS_MAP[row.status];
      if (!style) return <StatusChip label={row.status} bg="var(--color-status-draft)" />;
      return <StatusChip label={style.label} bg={style.bg} text={style.text} />;
    },
  },
  {
    key: 'sentAt',
    label: 'Sent At',
    width: '180px',
    render: (row) => formatDateTimeOrDash(row.sentAt),
  },
  {
    key: 'outcomeAt',
    label: 'Delivered / Failed At',
    width: '200px',
    render: (row) => formatDateTimeOrDash(row.deliveredAt ?? row.failedAt),
  },
  {
    key: 'failureReason',
    label: 'Failure Reason',
    width: '280px',
    render: (row) => row.failureReason ?? '\u2014',
  },
  {
    key: 'retryCount',
    label: 'Retries',
    width: '100px',
    align: 'center',
    render: (row) => row.retryCount,
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
