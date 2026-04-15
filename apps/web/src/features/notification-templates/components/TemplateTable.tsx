import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { NotificationClassChip } from './NotificationClassChip';
import type { NotificationTemplate } from '../types';

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL: 'bg-[#B3E5FC] text-[#01579B]',
  SMS: 'bg-[#FFE0B2] text-[#E65100]',
  WHATSAPP: 'bg-[#C8E6C9] text-[#1B5E20]',
};

interface TemplateTableProps {
  data: NotificationTemplate[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  onEdit?: (template: NotificationTemplate) => void;
}

export function TemplateTable({
  data,
  loading,
  error,
  onRetryError,
  onEdit,
}: TemplateTableProps) {
  const columns: DataTableColumn<NotificationTemplate>[] = [
    {
      key: 'code',
      label: 'Code',
    },
    {
      key: 'scope',
      label: 'Scope',
      width: '170px',
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {row.tenantId ? 'Agency Override' : 'Platform Default'}
        </span>
      ),
    },
    {
      key: 'channel',
      label: 'Channel',
      width: '130px',
      render: (row) => {
        const colorClass = CHANNEL_COLORS[row.channel] ?? 'bg-gray-100 text-gray-800';
        return (
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
            {row.channel}
          </span>
        );
      },
    },
    {
      key: 'notificationClass',
      label: 'Class',
      width: '130px',
      render: (row) => <NotificationClassChip notificationClass={row.notificationClass} />,
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (row) => <>{row.subject || '—'}</>,
    },
    {
      key: 'active',
      label: 'Active',
      width: '90px',
      align: 'center',
      render: (row) => (
        <i
          className={`mdi ${row.active ? 'mdi-check-bold text-success' : 'mdi-close-thick text-error'} text-lg`}
          aria-label={row.active ? 'Active' : 'Inactive'}
        />
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
    <DataTable<NotificationTemplate>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      keyExtractor={(row) => row.id}
    />
  );
}
