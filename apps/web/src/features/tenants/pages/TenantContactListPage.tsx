import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { TenantFilters } from '../components/TenantFilters';
import { TenantTable } from '../components/TenantTable';
import { TenantContactDetailDrawer } from '../components/TenantContactDetailDrawer';
import { useTenantContactList } from '../hooks/useTenantContactList';

export function TenantContactListPage() {
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
  } = useTenantContactList();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleView = useCallback((contact: { id: string }) => {
    setSelectedId(contact.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
  }, []);

  return (
    <ListFilterTableTemplate title="Tenants">
      <TenantFilters
        filters={filters}
        onFiltersChange={setFilters}
      />
      <TenantTable
        data={data}
        loading={isLoading}
        error={isError ? (errorMessage ?? 'Failed to load tenants') : undefined}
        onRetryError={refetch}
        pagination={pagination}
        sorting={sorting}
        onView={handleView}
      />
      <TenantContactDetailDrawer
        contactId={selectedId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </ListFilterTableTemplate>
  );
}
