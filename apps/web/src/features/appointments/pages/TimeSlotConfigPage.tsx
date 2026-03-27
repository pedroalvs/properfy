import { useState, useCallback, useMemo } from 'react';
import { UserRole } from '@properfy/shared';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTimeSlotList, useTimeSlotSave, useTimeSlotDelete, type TimeSlot } from '../hooks/useTimeSlotAdmin';
import { TimeSlotFormDrawer } from '../components/TimeSlotFormDrawer';

export function TimeSlotConfigPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useSnackbar();
  const isAdminUser = user?.role === UserRole.AM || user?.role === UserRole.OP;

  // Filters
  const [selectedTenantId, setSelectedTenantId] = useState(
    isAdminUser ? '' : (user?.tenantId ?? ''),
  );
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const { options: tenantOptions, isLoading: isLoadingTenants } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'time-slot-filter-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isAdminUser },
  );

  const activeTenantId = selectedTenantId || user?.tenantId || undefined;

  const { options: branchOptions, isLoading: isLoadingBranches } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'time-slot-filter-options', activeTenantId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { tenantId: activeTenantId ?? '' },
    { enabled: !!activeTenantId },
  );

  const branchFilterOptions = [
    { value: '', label: 'All' },
    { value: '__tenant_default__', label: 'Tenant Default' },
    ...branchOptions,
  ];

  // Data
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
  } = useTimeSlotList(
    activeTenantId,
    selectedBranchId === '__tenant_default__' ? '' : (selectedBranchId || undefined) as any,
  );

  // Filter data client-side for tenant default
  const filteredData = useMemo(() => {
    if (selectedBranchId === '__tenant_default__') {
      return data.filter((slot) => !slot.branchId);
    }
    return data;
  }, [data, selectedBranchId]);

  // Sort by sortOrder
  const sortedData = useMemo(
    () => [...filteredData].sort((a, b) => a.sortOrder - b.sortOrder),
    [filteredData],
  );

  // Drawer state
  const [formOpen, setFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<TimeSlot | null>(null);

  // Delete state
  const [deleteSlot, setDeleteSlot] = useState<TimeSlot | null>(null);
  const { remove } = useTimeSlotDelete();
  const { save: toggleSave } = useTimeSlotSave();

  const handleNewSlot = useCallback(() => {
    setEditSlot(null);
    setFormOpen(true);
  }, []);

  const handleEditSlot = useCallback((slot: TimeSlot) => {
    setEditSlot(slot);
    setFormOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setFormOpen(false);
    setEditSlot(null);
  }, []);

  const handleSaved = useCallback(() => {
    handleCloseDrawer();
    refetch();
  }, [handleCloseDrawer, refetch]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteSlot) return;
    const result = await remove(deleteSlot.id);
    if (result.success) {
      showSuccess('Time slot deleted successfully');
      setDeleteSlot(null);
      refetch();
    } else {
      showError(result.error ?? 'Failed to delete');
    }
  }, [deleteSlot, remove, showSuccess, showError, refetch]);

  const handleToggleActive = useCallback(async (slot: TimeSlot) => {
    const result = await toggleSave(
      {
        label: slot.label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sortOrder: slot.sortOrder,
        isActive: !slot.isActive,
      },
      slot.id,
    );
    if (result.success) {
      showSuccess(slot.isActive ? 'Time slot deactivated' : 'Time slot activated');
      refetch();
    } else {
      showError(result.error ?? 'Failed to update');
    }
  }, [toggleSave, showSuccess, showError, refetch]);

  const columns: DataTableColumn<TimeSlot>[] = useMemo(() => [
    {
      key: 'label',
      label: 'Label',
      sortable: true,
    },
    {
      key: 'startTime',
      label: 'Start',
      width: '100px',
    },
    {
      key: 'endTime',
      label: 'End',
      width: '100px',
    },
    {
      key: 'sortOrder',
      label: 'Order',
      width: '80px',
      align: 'center' as const,
    },
    {
      key: 'isActive',
      label: 'Active',
      width: '80px',
      align: 'center' as const,
      render: (row: TimeSlot) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(row);
          }}
          className="inline-flex items-center justify-center"
          aria-label={row.isActive ? 'Deactivate' : 'Activate'}
        >
          <i
            className={`mdi ${row.isActive ? 'mdi-check-bold text-success' : 'mdi-close-thick text-error'} text-lg`}
            aria-hidden="true"
          />
        </button>
      ),
    },
    {
      key: 'branchId',
      label: 'Scope',
      hideOnMobile: true,
      render: (row: TimeSlot) => (
        <span className="text-sm text-text-secondary">
          {row.branchId ? branchOptions.find((b) => b.value === row.branchId)?.label ?? 'Branch' : 'Tenant Default'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: '100px',
      align: 'right' as const,
      render: (row: TimeSlot) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-pencil-outline',
              label: 'Edit',
              onClick: () => handleEditSlot(row),
            },
            {
              icon: 'mdi-delete-outline',
              label: 'Delete',
              variant: 'delete',
              onClick: () => setDeleteSlot(row),
            },
          ]}
        />
      ),
    },
  ], [handleToggleActive, handleEditSlot, branchOptions]);

  return (
    <>
      <ListFilterTableTemplate
        title="Time Slots"
        primaryAction={{
          label: 'New Time Slot',
          icon: 'mdi-plus',
          onClick: handleNewSlot,
        }}
      >
        <FilterBar>
          {isAdminUser && (
            <FilterSelect
              label="Tenant"
              value={selectedTenantId}
              onChange={(v) => {
                setSelectedTenantId(v);
                setSelectedBranchId('');
              }}
              options={tenantOptions}
              placeholder={isLoadingTenants ? 'Loading...' : 'All Tenants'}
            />
          )}
          <FilterSelect
            label="Branch"
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            options={branchFilterOptions}
            placeholder={isLoadingBranches ? 'Loading...' : 'All'}
          />
        </FilterBar>

        <DataTable<TimeSlot>
          columns={columns}
          data={sortedData}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load time slots') : undefined}
          onRetryError={refetch}
          emptyMessage="No time slots configured yet"
          keyExtractor={(row) => row.id}
        />
      </ListFilterTableTemplate>

      <TimeSlotFormDrawer
        open={formOpen}
        onClose={handleCloseDrawer}
        onSaved={handleSaved}
        slot={editSlot}
        defaultTenantId={selectedTenantId || (isAdminUser ? '' : (user?.tenantId ?? ''))}
        defaultBranchId={selectedBranchId === '__tenant_default__' ? '' : selectedBranchId}
      />

      <ConfirmDialog
        open={!!deleteSlot}
        title="Delete Time Slot"
        message={`Are you sure you want to delete "${deleteSlot?.label ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteSlot(null)}
      />
    </>
  );
}
