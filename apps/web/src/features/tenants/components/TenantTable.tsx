import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';
import type { TenantContact } from '../types';

interface TenantTableProps {
  data: TenantContact[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (contact: TenantContact) => void;
}

export function TenantTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
}: TenantTableProps) {
  const columns: DataTableColumn<TenantContact>[] = [
    {
      key: 'name',
      label: 'Nome',
      sortable: true,
    },
    {
      key: 'primaryEmail',
      label: 'E-mail',
      width: '200px',
      render: (row) => <>{row.primaryEmail ?? '—'}</>,
    },
    {
      key: 'primaryPhone',
      label: 'Telefone',
      width: '140px',
      render: (row) => <>{row.primaryPhone ?? '—'}</>,
    },
    {
      key: 'confirmationStatus',
      label: 'Confirmação',
      width: '160px',
      sortable: true,
      render: (row) => <TenantConfirmationStatusChip status={row.confirmationStatus} />,
    },
    {
      key: 'propertyAddress',
      label: 'Imóvel',
    },
    {
      key: 'appointmentDate',
      label: 'Data Vistoria',
      width: '140px',
      sortable: true,
      render: (row) => <>{new Date(row.appointmentDate).toLocaleDateString('pt-BR')}</>,
    },
    {
      key: 'lastActivityAt',
      label: 'Última Atividade',
      width: '150px',
      sortable: true,
      render: (row) => (
        <>
          {row.lastActivityAt
            ? new Date(row.lastActivityAt).toLocaleDateString('pt-BR')
            : '—'}
        </>
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
              icon: 'mdi-eye-outline',
              label: 'Visualizar',
              onClick: () => onView?.(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<TenantContact>
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
