import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { FinancialFilters } from '../components/FinancialFilters';
import { FinancialTable } from '../components/FinancialTable';
import { FinancialEntryDetailDrawer } from '../components/FinancialEntryDetailDrawer';
import { FinancialEntryFormDrawer } from '../components/FinancialEntryFormDrawer';
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

  return (
    <>
      <ListFilterTableTemplate
        title="Financial"
        primaryAction={{
          label: 'New Entry',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        <FinancialFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
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
      </ListFilterTableTemplate>
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
    </>
  );
}
