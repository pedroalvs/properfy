import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
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
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onEdit?: (template: NotificationTemplate) => void;
}

export function TemplateTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onEdit,
}: TemplateTableProps) {
  const columns: DataTableColumn<NotificationTemplate>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
    },
    {
      key: 'channel',
      label: 'Channel',
      width: '130px',
      sortable: true,
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
      pagination={pagination}
      sorting={sorting}
      keyExtractor={(row) => row.id}
    />
  );
}
