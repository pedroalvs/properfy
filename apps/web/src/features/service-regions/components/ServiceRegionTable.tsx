import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { TENANT_ADMIN_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceRegion } from '../types';

interface ServiceRegionTableProps {
  data: ServiceRegion[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (region: ServiceRegion) => void;
  onEdit?: (region: ServiceRegion) => void;
}

export function ServiceRegionTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  onEdit,
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
        const style = TENANT_ADMIN_STATUS_MAP[row.status];
        if (!style) return <>{row.status}</>;
        return (
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {style.label}
          </span>
        );
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
