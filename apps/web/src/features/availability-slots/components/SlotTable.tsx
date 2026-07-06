import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { SlotStatusChip } from './SlotStatusChip';
import type { AvailabilitySlot } from '../types';

interface SlotTableProps {
  data: AvailabilitySlot[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onEdit?: (slot: AvailabilitySlot) => void;
}

export function SlotTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onEdit,
}: SlotTableProps) {
  const columns: DataTableColumn<AvailabilitySlot>[] = [
    {
      key: 'inspectorName',
      label: 'Inspector',
      width: '180px',
      sortable: true,
    },
    {
      key: 'date',
      label: 'Date',
      width: '130px',
      sortable: true,
      render: (row) => <>{formatDate(row.date)}</>,
    },
    {
      key: 'startTime',
      label: 'Time',
      width: '140px',
      render: (row) => <>{row.startTime} - {row.endTime}</>,
    },
    {
      key: 'region',
      label: 'Region',
      width: '160px',
      sortable: true,
    },
    {
      key: 'capacity',
      label: 'Capacity',
      width: '120px',
      render: (row) => (
        <span>
          {row.bookedCount}/{row.capacity}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <SlotStatusChip status={row.status} />
          {row.isOperatorOverride && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-300">
              Override
            </span>
          )}
        </span>
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
    <DataTable<AvailabilitySlot>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      defaultSort={{ key: 'date', order: 'asc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
