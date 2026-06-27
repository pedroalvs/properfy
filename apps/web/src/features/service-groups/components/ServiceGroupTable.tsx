import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { Agency, ServiceGroup } from '../types';

/** Compact agency label: "—" | "Acme" | "Acme, Globex" | "Acme, Globex +2". */
export function formatAgencies(agencies: Agency[] | undefined): string {
  if (!agencies || agencies.length === 0) return '—';
  if (agencies.length <= 2) return agencies.map((a) => a.name).join(', ');
  return `${agencies[0]!.name}, ${agencies[1]!.name} +${agencies.length - 2}`;
}

interface ServiceGroupTableProps {
  data: ServiceGroup[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (sg: ServiceGroup) => void;
}

export function ServiceGroupTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
}: ServiceGroupTableProps) {
  const columns: DataTableColumn<ServiceGroup>[] = [
    {
      key: 'code',
      label: 'Code',
      width: '90px',
      sortable: true,
      render: (row) => <span className="font-mono text-text-secondary">{row.code ?? '—'}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => <>{row.name ?? '—'}</>,
    },
    {
      key: 'agencies',
      label: 'Agency',
      width: '200px',
      render: (row) => (
        <span title={row.agencies?.map((a) => a.name).join(', ')}>{formatAgencies(row.agencies)}</span>
      ),
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
      defaultSort={{ key: 'name', order: 'asc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
