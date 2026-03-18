import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { SlotStatusChip } from './SlotStatusChip';
import type { AvailabilitySlot } from '../types';

interface SlotTableProps {
  data: AvailabilitySlot[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onEdit?: (slot: AvailabilitySlot) => void;
}

export function SlotTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
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
      render: (row) => <>{new Date(row.date).toLocaleDateString('en-AU')}</>,
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
      render: (row) => <SlotStatusChip status={row.status} />,
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
      sorting={sorting}
      keyExtractor={(row) => row.id}
    />
  );
}
