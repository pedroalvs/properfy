import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { AppStatusBadge } from './AppStatusBadge';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { SecretValue } from '@/components/ui/SecretValue';
import type { AppCredentialRow } from '../types';

interface AppTableProps {
  data: AppCredentialRow[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onEdit?: (app: AppCredentialRow) => void;
  onDeactivate?: (app: AppCredentialRow) => void;
  onReactivate?: (app: AppCredentialRow) => void;
  canMutate?: boolean;
}

export function AppTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onEdit,
  onDeactivate,
  onReactivate,
  canMutate = false,
}: AppTableProps) {
  const columns: DataTableColumn<AppCredentialRow>[] = [
    { key: 'name', label: 'Name', sortable: true },
    {
      key: 'username',
      label: 'Username',
      render: (row) => <SecretValue value={row.username} label="username" />,
    },
    {
      key: 'password',
      label: 'Password',
      render: (row) => <SecretValue value={row.password} maskable label="password" />,
    },
    {
      key: 'tenantName',
      label: 'Agency',
      render: (row) => <>{row.tenantName ?? '—'}</>,
    },
    {
      key: 'branchName',
      label: 'Branch',
      render: (row) => <>{row.branchName ?? 'All branches'}</>,
    },
    {
      key: 'isDefault',
      label: 'All appointments',
      width: '130px',
      render: (row) => <BooleanIcon value={row.isDefault} />,
    },
    {
      key: 'isActive',
      label: 'Status',
      width: '110px',
      render: (row) => <AppStatusBadge isActive={row.isActive} />,
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => {
        const actions = [];
        if (canMutate && onEdit) {
          actions.push({ icon: 'mdi-pencil-outline', label: 'Edit', onClick: () => onEdit(row) });
        }
        if (canMutate && row.isActive && onDeactivate) {
          actions.push({ icon: 'mdi-archive-outline', label: 'Deactivate', onClick: () => onDeactivate(row) });
        }
        if (canMutate && !row.isActive && onReactivate) {
          actions.push({ icon: 'mdi-restore', label: 'Reactivate', onClick: () => onReactivate(row) });
        }
        return actions.length > 0 ? <RowActions actions={actions} /> : null;
      },
    },
  ];

  return (
    <DataTable<AppCredentialRow>
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
