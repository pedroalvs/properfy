import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { StatusChip } from '@/components/ui/StatusChip';
import { TENANT_ADMIN_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceRegion } from '../types';

interface ServiceRegionTableProps {
  data: ServiceRegion[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (region: ServiceRegion) => void;
  onDeactivate?: (region: ServiceRegion) => void;
  onActivate?: (region: ServiceRegion) => void;
  onDelete?: (region: ServiceRegion) => void;
}

export function ServiceRegionTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  onDeactivate,
  onActivate,
  onDelete,
}: ServiceRegionTableProps) {
  const columns: DataTableColumn<ServiceRegion>[] = [
    {
      key: 'name',
      label: 'Name',
      width: '250px',
      sortable: true,
    },
    {
      key: 'color',
      label: 'Color',
      width: '80px',
      render: (row) => (
        <div
          className="h-5 w-5 rounded border border-black/10"
          style={{ backgroundColor: row.color }}
          title={row.color}
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => {
        // UX-baseline cleanup: use the shared `StatusChip`. Service-region
        // statuses ride on `TENANT_ADMIN_STATUS_MAP` (ACTIVE / INACTIVE /
        // PENDING). Unknown values fall back to a neutral chip.
        const style = TENANT_ADMIN_STATUS_MAP[row.status];
        if (!style) return <StatusChip label={row.status} bg="var(--color-status-draft)" />;
        return <StatusChip label={style.label} bg={style.bg} text={style.text} />;
      },
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-eye-outline',
              label: 'View',
              onClick: () => onView?.(row),
            },
            ...(row.status === 'ACTIVE'
              ? [
                  {
                    icon: 'mdi-close-circle-outline',
                    label: 'Deactivate',
                    onClick: () => onDeactivate?.(row),
                  },
                ]
              : []),
            ...(row.status === 'INACTIVE'
              ? [
                  {
                    icon: 'mdi-check-circle-outline',
                    label: 'Activate',
                    onClick: () => onActivate?.(row),
                  },
                  {
                    icon: 'mdi-delete-outline',
                    label: 'Delete',
                    onClick: () => onDelete?.(row),
                    variant: 'delete' as const,
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<ServiceRegion>
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
