import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { formatDate } from '@/lib/format-date';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TenantStatusChip } from './TenantStatusChip';
import { BranchFormDrawer } from './BranchFormDrawer';
import { useBranchList } from '../hooks/useBranchList';
import { useBranchDeactivate } from '../hooks/useBranchDeactivate';
import type { Branch } from '../types';

interface BranchSectionProps {
  tenantId: string;
}

export function BranchSection({ tenantId }: BranchSectionProps) {
  const { data, isLoading, isError, refetch, pagination } = useBranchList(tenantId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deactivatingBranch, setDeactivatingBranch] = useState<Branch | null>(null);

  const { deactivate, isDeactivating } = useBranchDeactivate(
    tenantId,
    deactivatingBranch?.id ?? null,
    () => {
      setDeactivatingBranch(null);
      refetch();
    },
  );

  const handleAdd = useCallback(() => {
    setEditingBranch(null);
    setDrawerOpen(true);
  }, []);

  const handleEdit = useCallback((branch: Branch) => {
    setEditingBranch(branch);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditingBranch(null);
  }, []);

  const handleSaved = useCallback(() => {
    setDrawerOpen(false);
    setEditingBranch(null);
    refetch();
  }, [refetch]);

  const handleDeactivateClick = useCallback((branch: Branch) => {
    setDeactivatingBranch(branch);
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    deactivate();
  }, [deactivate]);

  const handleCancelDeactivate = useCallback(() => {
    setDeactivatingBranch(null);
  }, []);

  const columns: DataTableColumn<Branch>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'address',
      label: 'Address',
      render: (row) => <>{row.address ?? '—'}</>,
    },
    {
      key: 'contactEmail',
      label: 'Contact Email',
      width: '200px',
      render: (row) => <>{row.contactEmail ?? '—'}</>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      render: (row) => <TenantStatusChip status={row.status} />,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: '140px',
      render: (row) => <>{formatDate(row.createdAt)}</>,
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-pencil-outline',
              label: 'Edit',
              onClick: () => handleEdit(row),
            },
            ...(row.status === 'ACTIVE'
              ? [
                  {
                    icon: 'mdi-close-circle-outline',
                    label: 'Deactivate',
                    onClick: () => handleDeactivateClick(row),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">
          Branches
        </h3>
        <Button variant="primary" onClick={handleAdd}>
          <i className="mdi mdi-plus" aria-hidden="true" />
          Add Branch
        </Button>
      </div>

      <DataTable<Branch>
        columns={columns}
        data={data}
        loading={isLoading}
        error={isError ? 'Failed to load branches' : undefined}
        onRetryError={refetch}
        pagination={pagination}
        defaultSort={{ key: 'name', order: 'asc' }}
        keyExtractor={(row) => row.id}
      />

      <BranchFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        tenantId={tenantId}
        branch={editingBranch}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deactivatingBranch}
        title="Deactivate Branch"
        message={`Are you sure you want to deactivate "${deactivatingBranch?.name}"? This action cannot be easily undone.`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onClose={handleCancelDeactivate}
      />
    </div>
  );
}
