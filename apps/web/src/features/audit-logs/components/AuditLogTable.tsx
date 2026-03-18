import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDateTime } from '@/lib/format-date';
import type { AuditLog } from '../types';

interface AuditLogTableProps {
  data: AuditLog[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (log: AuditLog) => void;
}

export function AuditLogTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
}: AuditLogTableProps) {
  const columns: DataTableColumn<AuditLog>[] = [
    {
      key: 'createdAt',
      label: 'Timestamp',
      width: '180px',
      sortable: true,
      render: (row) => <>{formatDateTime(row.createdAt)}</>,
    },
    {
      key: 'actorType',
      label: 'Actor',
      width: '120px',
      render: (row) => <>{row.actorType}{row.actorId ? ` (${row.actorId.slice(0, 8)})` : ''}</>,
    },
    {
      key: 'entityType',
      label: 'Entity Type',
      width: '140px',
      sortable: true,
    },
    {
      key: 'entityId',
      label: 'Entity ID',
      width: '120px',
      render: (row) => <>{row.entityId ? row.entityId.slice(0, 8) + '...' : '—'}</>,
    },
    {
      key: 'action',
      label: 'Action',
      width: '160px',
      sortable: true,
    },
    {
      key: 'reason',
      label: 'Reason',
      width: '200px',
      render: (row) => <>{row.reason ?? '—'}</>,
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
              onClick: () => onView?.(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<AuditLog>
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
