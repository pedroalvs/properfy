import { useState, useCallback, useMemo } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePermissions } from '@/hooks/usePermissions';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { InvoiceFilters } from '../components/InvoiceFilters';
import { InvoiceTable } from '../components/InvoiceTable';
import { InvoiceDetailDrawer } from '../components/InvoiceDetailDrawer';
import { GenerateInvoiceModal } from '../components/GenerateInvoiceModal';
import { MarkInvoicePaidModal } from '../components/MarkInvoicePaidModal';
import { useInvoiceList } from '../hooks/useInvoiceList';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import { FilterRequiredState } from '@/components/feedback/FilterRequiredState';
import type { Invoice } from '../types';

export function InvoicesPage() {
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const canModifyPayments = hasRole('AM', 'OP');
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const effectiveTenantId = isGlobalRole ? selectedTenantId : user?.tenantId ?? undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;
  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'invoice-form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );
  const { options: inspectorOptions } = useFormOptions<{ id: string; name: string | null }>(
    ['inspectors', 'invoice-filter-options', effectiveTenantId ?? ''],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name ?? item.id }),
    effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
    { enabled: !isGlobalRole || !!effectiveTenantId },
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
  } = useInvoiceList();

  const { download } = useInvoiceDownload();
  const inspectorLabelById = Object.fromEntries(
    inspectorOptions.map((option) => [option.value, option.label]),
  );
  const resolveInspectorLabel = useCallback(
    (inspectorId: string) => inspectorLabelById[inspectorId] ?? inspectorId,
    [inspectorLabelById],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
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

  const handleGenerated = useCallback(() => {
    setGenerateOpen(false);
    refetch();
  }, [refetch]);

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
      const allSelected =
        closedIdsOnPage.length > 0 && closedIdsOnPage.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        closedIdsOnPage.forEach((id) => next.delete(id));
      } else {
        closedIdsOnPage.forEach((id) => next.add(id));
      }
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

  return (
    <>
      <ListFilterTableTemplate
        title="Invoices"
        primaryAction={{
          label: 'Generate Invoice',
          icon: 'mdi-receipt-text-plus-outline',
          onClick: () => setGenerateOpen(true),
        }}
      >
        {isGlobalRole && (
          <div className="px-0 pb-2">
            <FormField label="Agency">
              <SelectInput
                value={selectedTenantId}
                onChange={setSelectedTenantId}
                options={tenantOptions}
                placeholder="Select agency to filter invoices"
                aria-label="Agency"
              />
            </FormField>
          </div>
        )}
        {requiresTenantSelection ? (
          <FilterRequiredState message="Select an agency to view invoices." />
        ) : (
          <>
            <InvoiceFilters
              filters={filters}
              onFiltersChange={setFilters}
              inspectorOptions={inspectorOptions}
            />
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
          </>
        )}
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
      <GenerateInvoiceModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={handleGenerated}
        tenantId={effectiveTenantId}
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
