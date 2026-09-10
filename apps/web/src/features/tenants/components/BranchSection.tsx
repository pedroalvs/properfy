import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { usePermissions } from '@/hooks/usePermissions';
import { formatInstantDate } from '@/lib/format-date';
import { TenantStatusChip } from './TenantStatusChip';
import { BranchFormDrawer } from './BranchFormDrawer';
import { DeactivateBranchModal } from './DeactivateBranchModal';
import { useBranchList } from '../hooks/useBranchList';
import { useBranchDeactivate } from '../hooks/useBranchDeactivate';
import { useBranchActivate } from '../hooks/useBranchActivate';
import type { Branch } from '../types';

interface BranchSectionProps {
  tenantId: string;
}

export function BranchSection({ tenantId }: BranchSectionProps) {
  const { data, isLoading, isError, refetch, pagination } = useBranchList(tenantId);

  // Branch activation/deactivation is AM/OP-only server-side (activate/deactivate
  // use cases assert ['AM','OP']); the tenant detail page also admits CL_ADMIN, so
  // hide the status actions they cannot perform instead of surfacing a 403 dead-end.
  const { hasRole } = usePermissions();
  const canManageStatus = hasRole('AM', 'OP');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deactivatingBranch, setDeactivatingBranch] = useState<Branch | null>(null);
  const [activatingBranch, setActivatingBranch] = useState<Branch | null>(null);

  // The hooks invalidate the mounted branch-list query, which refetches it — no
  // explicit refetch() needed in these callbacks (it would only fire a duplicate).
  const { deactivate, isDeactivating } = useBranchDeactivate(
    tenantId,
    deactivatingBranch?.id ?? null,
    () => setDeactivatingBranch(null),
  );

  const { activate, isActivating } = useBranchActivate(
    tenantId,
    activatingBranch?.id ?? null,
    () => setActivatingBranch(null),
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

  const handleConfirmDeactivate = useCallback((reason: string) => {
    deactivate(reason);
  }, [deactivate]);

  // Ignore dismissal (Cancel/backdrop/Escape) while the request is in flight so an
  // in-flight action cannot be abandoned and leak into another branch's dialog.
  const handleCancelDeactivate = useCallback(() => {
    if (!isDeactivating) setDeactivatingBranch(null);
  }, [isDeactivating]);

  const handleCancelActivate = useCallback(() => {
    if (!isActivating) setActivatingBranch(null);
  }, [isActivating]);

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
      render: (row) => <>{formatInstantDate(row.createdAt)}</>,
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
            ...(!canManageStatus
              ? []
              : row.status === 'ACTIVE'
                ? [
                    {
                      icon: 'mdi-close-circle-outline',
                      label: 'Deactivate',
                      onClick: () => handleDeactivateClick(row),
                    },
                  ]
                : [
                    {
                      icon: 'mdi-check-circle-outline',
                      label: 'Activate',
                      onClick: () => setActivatingBranch(row),
                    },
                  ]),
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

      <DeactivateBranchModal
        open={!!deactivatingBranch}
        branchName={deactivatingBranch?.name ?? ''}
        loading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onClose={handleCancelDeactivate}
      />

      <ConfirmDialog
        open={!!activatingBranch}
        onClose={handleCancelActivate}
        onConfirm={activate}
        title="Activate Branch"
        message={`You are about to activate "${activatingBranch?.name ?? ''}". The branch will accept new appointments again.`}
        confirmLabel="Activate"
        cancelLabel="Cancel"
        variant="warning"
        loading={isActivating}
      />
    </div>
  );
}
