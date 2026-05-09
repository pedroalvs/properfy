import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { ContactTypeChip } from './ContactTypeChip';
import { ContactStatusBadge } from './ContactStatusBadge';
import type { ContactListItem } from '../types';

interface ContactTableProps {
  data: ContactListItem[];
  loading?: boolean;
  error?: string;
  onRetryError?: () => void;
  pagination?: DataTablePagination;
  onView?: (contact: ContactListItem) => void;
  onEdit?: (contact: ContactListItem) => void;
  onDeactivate?: (contact: ContactListItem) => void;
  onReactivate?: (contact: ContactListItem) => void;
  canMutate?: boolean;
}

export function ContactTable({
  data,
  loading,
  error,
  onRetryError,
  pagination,
  onView,
  onEdit,
  onDeactivate,
  onReactivate,
  canMutate = false,
}: ContactTableProps) {
  const columns: DataTableColumn<ContactListItem>[] = [
    {
      key: 'displayName',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'type',
      label: 'Type',
      width: '160px',
      sortable: true,
      render: (row) => <ContactTypeChip type={row.type} />,
    },
    {
      key: 'primaryEmail',
      label: 'Email',
      render: (row) => <>{row.primaryEmail ?? '—'}</>,
    },
    {
      key: 'primaryPhone',
      label: 'Phone',
      width: '160px',
      render: (row) => <>{row.primaryPhone ?? '—'}</>,
    },
    {
      key: 'propertyCount',
      label: 'Properties',
      width: '120px',
      sortable: true,
      render: (row) => <span aria-label="Linked properties">{row.propertyCount}</span>,
    },
    {
      key: 'isActive',
      label: 'Status',
      width: '110px',
      render: (row) => <ContactStatusBadge isActive={row.isActive} />,
    },
    {
      key: 'actions',
      label: '',
      width: '100px',
      render: (row) => {
        const actions = [
          {
            icon: 'mdi-eye-outline',
            label: 'View',
            onClick: () => onView?.(row),
          },
        ];
        if (canMutate && onEdit) {
          actions.push({
            icon: 'mdi-pencil-outline',
            label: 'Edit',
            onClick: () => onEdit(row),
          });
        }
        if (canMutate && row.isActive && onDeactivate) {
          actions.push({
            icon: 'mdi-archive-outline',
            label: 'Deactivate',
            onClick: () => onDeactivate(row),
          });
        }
        if (canMutate && !row.isActive && onReactivate) {
          actions.push({
            icon: 'mdi-restore',
            label: 'Reactivate',
            onClick: () => onReactivate(row),
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <DataTable<ContactListItem>
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      onRetryError={onRetryError}
      pagination={pagination}
      defaultSort={{ key: 'displayName', order: 'asc' }}
      keyExtractor={(row) => row.id}
    />
  );
}
