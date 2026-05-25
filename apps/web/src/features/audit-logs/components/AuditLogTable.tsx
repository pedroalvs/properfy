import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDateTime } from '@/lib/format-date';
import { formatAuditAction, formatAuditActor, formatAuditTenant, summarizeAuditChanges } from '../lib/audit-log-display';
import type { AuditLog } from '../types';

interface AuditLogTableProps {
  data: AuditLog[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (log: AuditLog) => void;
}

function actorChipStyle(actorType: string): { bg: string; text?: string } {
  switch (actorType) {
    case 'USER':
      return { bg: '#B3E5FC' };
    case 'SYSTEM':
      return { bg: '#C8E6C9' };
    case 'ANONYMOUS':
      return { bg: '#FFE0B2' };
    default:
      return { bg: '#E0E0E0' };
  }
}

export function AuditLogTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
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
      width: '180px',
      render: (row) => {
        const style = actorChipStyle(row.actorType);
        return (
          <div className="flex flex-col gap-1">
            <StatusChip label={row.actorType} bg={style.bg} text={style.text} />
            <span className="text-xs text-text-secondary">
              {formatAuditActor(row.actorType, row.actorId, row.actorName)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'tenantId',
      label: 'Tenant',
      width: '180px',
      render: (row) => <>{formatAuditTenant(row.tenantId, row.tenantName)}</>,
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
      width: '180px',
      render: (row) => <>{row.entityId ?? '—'}</>,
    },
    {
      key: 'action',
      label: 'Action',
      width: '220px',
      sortable: true,
      render: (row) => <>{formatAuditAction(row.action)}</>,
    },
    {
      key: 'changes',
      label: 'Changed Fields',
      width: '200px',
      render: (row) => <>{summarizeAuditChanges(row)}</>,
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
      defaultSort={{ key: 'createdAt', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
