import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { InspectorStatusChip } from './InspectorStatusChip';
import type { Inspector } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';

interface InspectorTableProps {
  data: Inspector[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (inspector: Inspector) => void;
}

export function InspectorTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
}: InspectorTableProps) {
  const columns: DataTableColumn<Inspector>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'email',
      label: 'Email',
      width: '220px',
      sortable: true,
    },
    {
      key: 'phone',
      label: 'Phone',
      width: '140px',
      render: (row) => <>{row.phone ? formatAuPhone(row.phone) : '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <InspectorStatusChip status={row.status} />,
    },
    {
      key: 'regionsCount',
      label: 'Regions',
      width: '100px',
    },
    {
      key: 'serviceTypesCount',
      label: 'Services',
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
    <DataTable<Inspector>
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
