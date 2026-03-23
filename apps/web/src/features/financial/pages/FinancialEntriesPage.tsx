import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useSnackbar } from '@/hooks/useSnackbar';
import { FinancialSummaryBar } from '../components/FinancialSummaryBar';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { FinancialBatchActions } from '../components/FinancialBatchActions';
import { CreateAdjustmentModal } from '../components/CreateAdjustmentModal';
import { CreateRefundModal } from '../components/CreateRefundModal';
import { useFinancialList } from '../hooks/useFinancialList';

export function FinancialEntriesPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  } = useFinancialList();

  const { showSuccess, showError } = useSnackbar();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

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

  const handleApproveComplete = useCallback((result: { success: boolean; failedCount: number }) => {
    if (result.success) {
      showSuccess('All selected entries approved');
    } else {
      showError(`${result.failedCount} entries failed to approve`);
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

  return (
    <>
      <ListFilterTableTemplate
        title="Financial Entries"
        secondaryActions={[
          {
            label: 'Adjustment',
            icon: 'mdi-tune-vertical',
            onClick: () => setAdjustmentOpen(true),
          },
          {
            label: 'Refund',
            icon: 'mdi-cash-refund',
            onClick: () => setRefundOpen(true),
          },
        ]}
      >
        <FinancialSummaryBar />
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
            sorting={sorting}
            onView={handleView}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAllPending={handleSelectAllPending}
          />
        </div>
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
