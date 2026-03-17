import { DataTable, type DataTableColumn, type DataTablePagination, type DataTableSorting } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { UserRoleChip } from './UserRoleChip';
import { UserStatusChip } from './UserStatusChip';
import type { User } from '../types';

interface UserTableProps {
  data: User[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  sorting?: DataTableSorting;
  onView?: (user: User) => void;
  onEdit?: (user: User) => void;
}

export function UserTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  sorting,
  onView,
  onEdit,
}: UserTableProps) {
  const columns: DataTableColumn<User>[] = [
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
      key: 'role',
      label: 'Role',
      width: '150px',
      sortable: true,
      render: (row) => <UserRoleChip role={row.role} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      sortable: true,
      render: (row) => <UserStatusChip status={row.status} />,
    },
    {
      key: 'branchName',
      label: 'Branch',
      width: '160px',
      render: (row) => <>{row.branchName ?? '—'}</>,
    },
    {
      key: 'lastLoginAt',
      label: 'Last Login',
      width: '160px',
      sortable: true,
      render: (row) => (
        <>
          {row.lastLoginAt
            ? new Date(row.lastLoginAt).toLocaleDateString('pt-BR')
            : '—'}
        </>
      ),
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
    <DataTable<User>
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
