import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceTypeFilters } from '../components/ServiceTypeFilters';
import { ServiceTypeTable } from '../components/ServiceTypeTable';
import { ServiceTypeFormDrawer } from '../components/ServiceTypeFormDrawer';
import { useServiceTypeList } from '../hooks/useServiceTypeList';
import type { ServiceType } from '../types';

export function ServiceTypeListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useServiceTypeList();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleEdit = useCallback((st: ServiceType) => {
    setEditId(st.id);
    setFormOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    refetch();
  }, [refetch]);

  return (
    <>
      <ListFilterTableTemplate
        title="Service Types"
        primaryAction={{
          label: 'New Service Type',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        <ServiceTypeFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ServiceTypeTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load service types') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={handleEdit}
        />
      </ListFilterTableTemplate>
      <ServiceTypeFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        serviceTypeId={editId}
        onSaved={handleSaved}
      />
    </>
  );
}
