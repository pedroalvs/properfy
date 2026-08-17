import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { NotificationClassChip } from './NotificationClassChip';
import { NotificationTargetChip } from './NotificationTargetChip';
import { TemplateRowActions } from './TemplateRowActions';
import { getTemplateCodeLabel, type NotificationTemplate } from '../types';

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL: 'bg-[#B3E5FC] text-[#01579B]',
  SMS: 'bg-[#FFE0B2] text-[#E65100]',
};

interface TemplateTableProps {
  data: NotificationTemplate[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  onEdit?: (template: NotificationTemplate) => void;
  onDeleted?: () => void;
  /** AM/OP only — enables the delete action on agency overrides. */
  canDelete?: boolean;
}

export function TemplateTable({
  data,
  loading,
  error,
  onRetryError,
  onEdit,
  onDeleted,
  canDelete,
}: TemplateTableProps) {
  const columns: DataTableColumn<NotificationTemplate>[] = [
    {
      key: 'code',
      label: 'Type',
      render: (row) => (
        <span className="text-sm font-medium text-text-primary">
          {getTemplateCodeLabel(row.code)}
        </span>
      ),
    },
    {
      // Not sortable: DataTable sorts on `row[sortBy]`, and the target is derived from the
      // code rather than stored on the row.
      key: 'target',
      label: 'Target',
      width: '150px',
      render: (row) => <NotificationTargetChip templateCode={row.code} />,
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
      key: 'agency',
      label: 'Agency',
      width: '180px',
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {row.tenantId ? (row.tenantName ?? '—') : '—'}
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
      width: '96px',
      render: (row) => (
        <TemplateRowActions
          template={row}
          onEdit={onEdit}
          onDeleted={onDeleted}
          canDelete={canDelete}
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
