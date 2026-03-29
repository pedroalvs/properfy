import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceRegionFilters } from '../components/ServiceRegionFilters';
import { ServiceRegionTable } from '../components/ServiceRegionTable';
import { ServiceRegionFormDrawer } from '../components/ServiceRegionFormDrawer';
import { useServiceRegionList } from '../hooks/useServiceRegionList';
import type { ServiceRegion } from '../types';

export function ServiceRegionListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = useServiceRegionList();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleEdit = useCallback((region: ServiceRegion) => {
    setEditId(region.id);
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
        title="Service Regions"
        primaryAction={{
          label: 'New Region',
          icon: 'mdi-plus',
          onClick: () => {
            setEditId(null);
            setFormOpen(true);
          },
        }}
      >
        <ServiceRegionFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ServiceRegionTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load service regions') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          onView={handleEdit}
          onEdit={handleEdit}
        />
      </ListFilterTableTemplate>
      <ServiceRegionFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        regionId={editId}
        onSaved={handleSaved}
      />
    </>
  );
}
