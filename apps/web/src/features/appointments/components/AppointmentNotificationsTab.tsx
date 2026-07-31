import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { NOTIFICATION_STATUS_MAP } from '@/lib/status-colors';
import { formatInstantDateTime } from '@/lib/format-date';
import { useAppointmentNotifications, type AppointmentNotification } from '../hooks/useAppointmentNotifications';

interface AppointmentNotificationsTabProps {
  appointmentId: string;
}

function formatDateTimeOrDash(iso: string | null): string {
  if (!iso) return '\u2014';
  return formatInstantDateTime(iso);
}

/**
 * Human wording for the reason codes the pipeline sets itself.
 *
 * Unknown values fall through unchanged: everything else on this column is a raw provider
 * message, which is exactly what an operator needs to see verbatim when chasing a bounce.
 */
const FAILURE_REASON_LABELS: Record<string, string> = {
  AGENCY_TENANT_NOTIFICATIONS_DISABLED: 'Agency does not notify tenants — forwarded to the branch contact',
  AGENCY_FORWARD_NO_BRANCH_EMAIL: 'Agency does not notify tenants — NOT forwarded: the branch has no contact email',
  AGENCY_FORWARD_APPOINTMENT_NOT_FOUND: 'Agency does not notify tenants — NOT forwarded: appointment unavailable',
  AGENCY_FORWARD_NO_APPOINTMENT: 'Agency does not notify tenants — NOT forwarded: no linked appointment',
  AGENCY_FORWARD_FAILED: 'Agency does not notify tenants — forwarding to the branch contact failed',
  CONSENT_OPT_OUT: 'Recipient opted out of this notification class',
  TEMPLATE_NOT_FOUND: 'No template exists for this code and channel',
  BUDGET_EXCEEDED: 'Daily notification cap reached for this agency',
  INVALID_RECIPIENT_PHONE: 'Recipient phone number is not a valid AU number',
  EMPTY_SMS_BODY: 'Rendered SMS body was empty',
};

function formatFailureReason(reason: string | null | undefined): string {
  if (!reason) return '\u2014';
  return FAILURE_REASON_LABELS[reason] ?? reason;
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
    render: (row) => formatFailureReason(row.failureReason),
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
