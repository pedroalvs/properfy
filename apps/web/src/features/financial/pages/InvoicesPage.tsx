import { useState, useCallback, useMemo } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { usePermissions } from '@/hooks/usePermissions';
import { useFormOptions } from '@/hooks/useFormOptions';
import { Button } from '@/components/ui/Button';
import { TabsNav } from '@/components/layout/TabsNav';
import { InvoiceFilters } from '../components/InvoiceFilters';
import { InvoiceTable } from '../components/InvoiceTable';
import { InvoiceDetailDrawer } from '../components/InvoiceDetailDrawer';
import { MarkInvoicePaidModal } from '../components/MarkInvoicePaidModal';
import { InvoiceSummaryIndicators } from '../components/InvoiceSummaryIndicators';
import { useInvoiceList } from '../hooks/useInvoiceList';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import { useInvoiceSummary } from '../hooks/useInvoiceSummary';
import type { Invoice } from '../types';

// Pending = PENDING_REVIEW; Done = everything else (CLOSED, PAID, VOID).
const INVOICE_TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
];

export function InvoicesPage() {
  const { hasRole } = usePermissions();
  const canModifyPayments = hasRole('AM', 'OP');

  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useInvoiceList({ status: 'pending' });

  // Tabs own the status filter: Pending (PENDING_REVIEW) | Done (CLOSED, PAID, VOID).
  const activeTab = filters.status === 'done' ? 'done' : 'pending';

  // Inspector Property Invoices are global — filters (agency/branch/inspector) are content/owner
  // filters, not an agency gate. AM/OP see all invoices immediately.
  const { options: inspectorOptions } = useFormOptions<{ id: string; name: string | null }>(
    ['inspectors', 'invoice-filter-options'],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name ?? item.id }),
  );
  const { options: agencyOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'invoice-agency-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'invoice-branch-options', filters.agencyId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    filters.agencyId ? { tenantId: filters.agencyId } : undefined,
    { enabled: !!filters.agencyId },
  );

  const { download } = useInvoiceDownload();

  // Indicators are scoped by the non-status filters so they stay consistent with both tabs.
  const {
    summary,
    isLoading: summaryLoading,
    multiCurrencyError,
  } = useInvoiceSummary({
    inspectorId: filters.inspectorId,
    agencyId: filters.agencyId,
    branchId: filters.branchId,
    fromDate: filters.periodStart,
    toDate: filters.periodEnd,
  });

  const inspectorLabelById = Object.fromEntries(inspectorOptions.map((o) => [o.value, o.label]));
  const resolveInspectorLabel = useCallback(
    // Never surface the raw inspector id when the label lookup misses (feedback_no_raw_ids_in_ui).
    (inspectorId: string) => inspectorLabelById[inspectorId] ?? '—',
    [inspectorLabelById],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markPaidIds, setMarkPaidIds] = useState<string[] | null>(null);

  const handleView = useCallback((invoice: Invoice) => {
    setSelectedId(invoice.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  const handleDownload = useCallback((invoice: Invoice) => {
    download(invoice.id);
  }, [download]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const closedIdsOnPage = useMemo(
    () => data.filter((row) => row.status === 'CLOSED').map((row) => row.id),
    [data],
  );

  const handleToggleSelectAllClosed = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = closedIdsOnPage.length > 0 && closedIdsOnPage.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) closedIdsOnPage.forEach((id) => next.delete(id));
      else closedIdsOnPage.forEach((id) => next.add(id));
      return next;
    });
  }, [closedIdsOnPage]);

  const handleMarkPaidSingle = useCallback((invoiceId: string) => {
    setMarkPaidIds([invoiceId]);
  }, []);

  const handleMarkPaidBatch = useCallback(() => {
    if (selectedIds.size === 0) return;
    setMarkPaidIds(Array.from(selectedIds));
  }, [selectedIds]);

  const handleMarkPaidSuccess = useCallback(() => {
    setSelectedIds(new Set());
    refetch();
  }, [refetch]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setFilters({ ...filters, status: tabId });
      // Row selection is page-scoped; switching tabs changes the underlying list.
      setSelectedIds(new Set());
    },
    [filters, setFilters],
  );

  return (
    <>
      <ListFilterTableTemplate title="Invoices">
        <InvoiceFilters
          filters={filters}
          onFiltersChange={setFilters}
          inspectorOptions={inspectorOptions}
          agencyOptions={agencyOptions}
          branchOptions={branchOptions}
          hideStatus
        />
        <InvoiceSummaryIndicators
          summary={summary}
          isLoading={summaryLoading}
          multiCurrencyError={multiCurrencyError}
        />
        <div className="mb-4">
          <TabsNav tabs={INVOICE_TABS} activeTab={activeTab} onChange={handleTabChange} />
        </div>
        <InvoiceTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load invoices') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          resolveInspectorLabel={resolveInspectorLabel}
          onView={handleView}
          onDownload={handleDownload}
          onMarkPaid={handleMarkPaidSingle}
          canModifyPayments={canModifyPayments}
          selectedIds={canModifyPayments ? selectedIds : undefined}
          onToggleSelect={canModifyPayments ? handleToggleSelect : undefined}
          onToggleSelectAllClosed={canModifyPayments ? handleToggleSelectAllClosed : undefined}
        />
      </ListFilterTableTemplate>
      {canModifyPayments && selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-secondary px-6 py-3 shadow-lg"
          data-testid="invoice-batch-actions-bar"
        >
          <span className="text-sm font-semibold text-white">
            {selectedIds.size} {selectedIds.size === 1 ? 'invoice' : 'invoices'} selected
          </span>
          <Button variant="primary" onClick={handleMarkPaidBatch}>
            Mark as Paid
          </Button>
          <Button variant="secondary" onClick={handleClearSelection}>
            Clear
          </Button>
        </div>
      )}
      <InvoiceDetailDrawer
        invoiceId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        resolveInspectorLabel={resolveInspectorLabel}
      />
      {markPaidIds && (
        <MarkInvoicePaidModal
          open={markPaidIds !== null}
          onClose={() => setMarkPaidIds(null)}
          invoiceIds={markPaidIds}
          onSuccess={handleMarkPaidSuccess}
        />
      )}
    </>
  );
}
