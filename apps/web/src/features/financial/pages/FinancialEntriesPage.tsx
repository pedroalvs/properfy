import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFormOptions } from '@/hooks/useFormOptions';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { FinancialSummaryBar } from '../components/FinancialSummaryBar';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { FinancialEntryFormDrawer } from '../components/FinancialEntryFormDrawer';
import { FinancialBatchActions } from '../components/FinancialBatchActions';
import { CreateAdjustmentModal } from '../components/CreateAdjustmentModal';
import { CreateRefundModal } from '../components/CreateRefundModal';
import { FilterRequiredState } from '@/components/feedback/FilterRequiredState';
import { NoPermissionState } from '@/components/feedback/NoPermissionState';
import { useFinancialList } from '../hooks/useFinancialList';

export function FinancialEntriesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const canViewFinancial = hasRole('AM', 'OP');
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;
  const effectiveTenantId = isGlobalRole ? selectedTenantId : user?.tenantId ?? undefined;
  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'financial-form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useFinancialList(effectiveTenantId, !requiresTenantSelection);

  const { showSuccess, showError } = useSnackbar();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleView = useCallback((entry: { id: string }) => {
    setSelectedId(entry.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pendingIds = data.filter((e) => e.status === 'PENDING').map((e) => e.id);

  const handleSelectAllPending = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = pendingIds.length > 0 && pendingIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(pendingIds);
    });
  }, [pendingIds]);

  const handleApproveComplete = useCallback((result: { 
    success: boolean; 
    failedCount: number; 
    errors: Array<{ id: string; message: string; code?: string; status?: number }> 
  }) => {
    if (result.success) {
      showSuccess('All selected entries approved');
    } else {
      const distinctCodes = Array.from(new Set(result.errors.map(e => e.code).filter(Boolean)));
      const distinctStatuses = Array.from(new Set(result.errors.map(e => e.status).filter(Boolean)));

      if (distinctCodes.includes('FORBIDDEN') || distinctStatuses.includes(403)) {
        showError(`${result.failedCount} entries failed: Permission denied`);
      } else if (distinctCodes.includes('FINANCIAL_ENTRY_ALREADY_PROCESSED')) {
        showError(`${result.failedCount} entries failed: Already processed or approved`);
      } else {
        showError(`${result.failedCount} entries failed to approve`);
      }
    }
    refetch();
  }, [showSuccess, showError, refetch]);

  const handleAdjustmentCreated = useCallback(() => {
    setAdjustmentOpen(false);
    refetch();
  }, [refetch]);

  const handleRefundCreated = useCallback(() => {
    setRefundOpen(false);
    refetch();
  }, [refetch]);

  if (user && !canViewFinancial) {
    return (
      <ListFilterTableTemplate title="Financial Entries">
        <NoPermissionState message="You don't have permission to view financial entries." />
      </ListFilterTableTemplate>
    );
  }

  return (
    <>
      <ListFilterTableTemplate
        title="Financial Entries"
        secondaryActions={[
          {
            label: 'Invoices',
            icon: 'mdi-file-document-outline',
            onClick: () => navigate('/financial/invoices'),
          },
          {
            label: 'Adjustment',
            icon: 'mdi-tune-vertical',
            onClick: () => setAdjustmentOpen(true),
            disabled: requiresTenantSelection,
          },
          {
            label: 'Refund',
            icon: 'mdi-cash-refund',
            onClick: () => setRefundOpen(true),
            disabled: requiresTenantSelection,
          },
        ]}
      >
        {isGlobalRole && (
          <div className="px-0 pb-2">
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to view financial entries"
                aria-label="Agency"
              />
            </FormField>
          </div>
        )}
        {requiresTenantSelection ? (
          <FilterRequiredState message="Select an agency to view financial entries." />
        ) : (
          <>
            <FinancialSummaryBar tenantId={effectiveTenantId} enabled={!requiresTenantSelection} />
            <FinancialFilters
              filters={filters}
              onFiltersChange={setFilters}
            />
            <div className="mt-2">
              <FinancialTable
                data={data}
                loading={isLoading}
                error={isError ? (errorMessage ?? 'Failed to load financial entries') : undefined}
                onRetryError={refetch}
                pagination={pagination}
                onView={handleView}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAllPending={handleSelectAllPending}
              />
            </div>
          </>
        )}
      </ListFilterTableTemplate>

      <FinancialBatchActions
        selectedIds={Array.from(selectedIds)}
        onClearSelection={() => setSelectedIds(new Set())}
        onApproveComplete={handleApproveComplete}
      />

      <FinancialEntryDetailDrawer
        entryId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onEdit={(id) => {
          setDrawerOpen(false);
          setSelectedId(null);
          setEditId(id);
          setFormOpen(true);
        }}
      />
      <FinancialEntryFormDrawer
        open={formOpen}
        entryId={editId}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditId(null);
          refetch();
        }}
      />
      <CreateAdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        onCreated={handleAdjustmentCreated}
      />
      <CreateRefundModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        onCreated={handleRefundCreated}
      />
    </>
  );
}
