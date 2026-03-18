import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useSnackbar } from '@/hooks/useSnackbar';
import { FinancialSummaryBar } from '../components/FinancialSummaryBar';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { FinancialEntryFormDrawer } from '../components/FinancialEntryFormDrawer';
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
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.length === data.length ? [] : data.map((e) => e.id),
    );
  }, [data]);

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
        primaryAction={{
          label: 'New Entry',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
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
          {!isLoading && data.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-3 rounded bg-app-bg px-3 py-2" data-testid="batch-select-bar">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={selectedIds.length === data.length && data.length > 0}
                  onChange={handleToggleSelectAll}
                  className="accent-primary"
                  aria-label="Select all entries"
                />
                Select all
              </label>
              <div className="flex flex-wrap gap-2">
                {data.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-center gap-1 rounded border border-black/10 bg-card-bg px-2 py-1 text-xs text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(entry.id)}
                      onChange={() => handleToggleSelect(entry.id)}
                      className="accent-primary"
                      aria-label={`Select ${entry.appointmentCode}`}
                    />
                    {entry.appointmentCode}
                  </label>
                ))}
              </div>
            </div>
          )}
          <FinancialTable
            data={data}
            loading={isLoading}
            error={isError ? (errorMessage ?? 'Failed to load financial entries') : undefined}
            onRetryError={refetch}
            pagination={pagination}
            sorting={sorting}
            onView={handleView}
            onEdit={handleView}
          />
        </div>
      </ListFilterTableTemplate>

      <FinancialBatchActions
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
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
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        entryId={editId}
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
