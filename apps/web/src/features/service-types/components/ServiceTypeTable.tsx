import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { FlowTypeChip } from './FlowTypeChip';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceType } from '../types';

interface ServiceTypeTableProps {
  data: ServiceType[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (serviceType: ServiceType) => void;
  onEdit?: (serviceType: ServiceType) => void;
}

export function ServiceTypeTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: ServiceTypeTableProps) {
  const columns: DataTableColumn<ServiceType>[] = [
    {
      key: 'code',
      label: 'Code',
      width: '120px',
      sortable: true,
    },
    {
      key: 'name',
      label: 'Name',
      width: '200px',
      sortable: true,
    },
    {
      key: 'flowType',
      label: 'Flow Type',
      width: '140px',
      sortable: true,
      render: (row) => <FlowTypeChip flowType={row.flowType} />,
    },
    {
      key: 'requiresTenantConfirmation',
      label: 'Confirmation',
      width: '120px',
      render: (row) => <BooleanIcon value={row.requiresTenantConfirmation} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => {
        const style = SERVICE_TYPE_STATUS_MAP[row.status as keyof typeof SERVICE_TYPE_STATUS_MAP];
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
    <DataTable<ServiceType>
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
