import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { StatusChip } from '@/components/ui/StatusChip';
import { FlowTypeChip } from './FlowTypeChip';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { ServiceType } from '../types';

interface ServiceTypeTableProps {
  data: ServiceType[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (serviceType: ServiceType) => void;
}

export function ServiceTypeTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
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
      key: 'requiresRentalTenantConfirmation',
      label: 'Confirmation',
      width: '120px',
      render: (row) => <BooleanIcon value={row.requiresRentalTenantConfirmation} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => {
        // UX-baseline cleanup: render via the shared `StatusChip`. When the
        // map misses an enum value we fall back to a neutral chip showing
        // the raw status — never the bare enum text — so future enum
        // additions stay visually consistent.
        const style = SERVICE_TYPE_STATUS_MAP[row.status as keyof typeof SERVICE_TYPE_STATUS_MAP];
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
      defaultSort={{ key: 'createdAt', order: 'desc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
