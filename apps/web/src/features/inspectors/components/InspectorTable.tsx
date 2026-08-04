import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { InspectorStatusChip } from './InspectorStatusChip';
import type { Inspector } from '../types';
import { StarRating } from '@/components/ui/StarRating';
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
      // Renamed from "Services": this has always been service-TYPE coverage, and
      // the ambiguity became untenable next to the completed-inspections count.
      key: 'serviceTypesCount',
      label: 'Service Types',
      width: '120px',
    },
    {
      key: 'ratingAvg',
      label: 'Rating',
      width: '140px',
      // Sorts the loaded page only, exactly like the existing name/email/status
      // columns — DataTable sorting is client-side.
      sortable: true,
      render: (row) => <StarRating value={row.ratingAvg} count={row.ratingCount} size="sm" showValue />,
    },
    {
      key: 'completedCount',
      label: 'Completed',
      width: '110px',
      sortable: true,
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
