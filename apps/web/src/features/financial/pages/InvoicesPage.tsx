import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { InvoiceFilters } from '../components/InvoiceFilters';
import { InvoiceTable } from '../components/InvoiceTable';
import { InvoiceDetailDrawer } from '../components/InvoiceDetailDrawer';
import { GenerateInvoiceModal } from '../components/GenerateInvoiceModal';
import { useInvoiceList } from '../hooks/useInvoiceList';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import type { Invoice } from '../types';

export function InvoicesPage() {
  const { user } = useAuth();
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
        />
      </ListFilterTableTemplate>
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
    </>
  );
}
