import { Link } from 'react-router-dom';
import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { ContactTypeChip } from './ContactTypeChip';
import { ContactStatusBadge } from './ContactStatusBadge';
import type { ContactListItem } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';

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
      render: (row) => <>{row.primaryPhone ? formatAuPhone(row.primaryPhone) : '—'}</>,
    },
    {
      key: 'propertyCount',
      label: 'Properties',
      width: '110px',
      sortable: true,
      render: (row) => <span aria-label="Linked properties">{row.propertyCount}</span>,
    },
    {
      key: 'primaryInPropertyCount',
      label: 'Primary in',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span aria-label={`Primary in ${row.primaryInPropertyCount} ${row.primaryInPropertyCount === 1 ? 'property' : 'properties'}`}>
          {row.primaryInPropertyCount === 0
            ? '—'
            : `${row.primaryInPropertyCount} ${row.primaryInPropertyCount === 1 ? 'property' : 'properties'}`}
        </span>
      ),
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
      width: '140px',
      // 023 §FR-203 — "Open detail" must navigate in a new tab so the operator
      // keeps the list as a workbench. Memory feedback_new_tab_detail.md.
      render: (row) => {
        const actions = [];
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
        return (
          <div className="flex items-center gap-1">
            <Link
              to={`/contacts/${row.id}`}
              aria-label="Open detail"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgba(0,0,0,0.54)] hover:bg-black/5"
            >
              <i className="mdi mdi-eye-outline text-lg" aria-hidden="true" />
            </Link>
            {actions.length > 0 ? <RowActions actions={actions} /> : null}
          </div>
        );
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
      onRowClick={onView}
    />
  );
}
