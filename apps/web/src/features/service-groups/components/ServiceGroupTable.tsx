import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { ServiceGroup } from '../types';

interface ServiceGroupTableProps {
  data: ServiceGroup[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (sg: ServiceGroup) => void;
  onEdit?: (sg: ServiceGroup) => void;
}

export function ServiceGroupTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: ServiceGroupTableProps) {
  const columns: DataTableColumn<ServiceGroup>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'regionName',
      label: 'Region',
      width: '180px',
      sortable: true,
      render: (row) => <>{row.regionName ?? '—'}</>,
    },
    {
      key: 'inspectorName',
      label: 'Inspector',
      width: '180px',
      sortable: true,
      render: (row) => <>{row.inspectorName ?? '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '130px',
      sortable: true,
      render: (row) => <ServiceGroupStatusChip status={row.status} />,
    },
    {
      key: 'priorityMode',
      label: 'Priority',
      width: '140px',
      render: (row) => {
        const style = PRIORITY_MODE_MAP[row.priorityMode];
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
      key: 'appointmentsCount',
      label: 'Appointments',
      width: '100px',
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
    <DataTable<ServiceGroup>
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
