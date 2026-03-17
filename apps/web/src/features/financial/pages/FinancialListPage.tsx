import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { useFinancialList } from '../hooks/useFinancialList';

export function FinancialListPage() {
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleView = useCallback((entry: { id: string }) => {
    setSelectedId(entry.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  return (
    <ListFilterTableTemplate
      title="Financeiro"
      primaryAction={{ label: 'Nova Entrada', icon: 'mdi-plus', onClick: () => {} }}
    >
      <FinancialFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <FinancialTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Erro ao carregar entradas financeiras') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={handleView}
        onEdit={handleView}
      />
      <FinancialEntryDetailDrawer
        entryId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </ListFilterTableTemplate>
  );
}
