import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { InvoiceFilters } from '../components/InvoiceFilters';
import { InvoiceTable } from '../components/InvoiceTable';
import { InvoiceDetailDrawer } from '../components/InvoiceDetailDrawer';
import { GenerateInvoiceModal } from '../components/GenerateInvoiceModal';
import { useInvoiceList } from '../hooks/useInvoiceList';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import type { Invoice } from '../types';

export function InvoicesPage() {
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
  } = useInvoiceList();

  const { download } = useInvoiceDownload();

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
        <InvoiceFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <InvoiceTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load invoices') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onView={handleView}
          onDownload={handleDownload}
        />
      </ListFilterTableTemplate>
      <InvoiceDetailDrawer
        invoiceId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
      <GenerateInvoiceModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={handleGenerated}
      />
    </>
  );
}
