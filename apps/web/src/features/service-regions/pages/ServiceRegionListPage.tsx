import { useState, useCallback, useMemo } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { ServiceRegionFilters } from '../components/ServiceRegionFilters';
import { ServiceRegionTable } from '../components/ServiceRegionTable';
import { ServiceRegionFormDrawer } from '../components/ServiceRegionFormDrawer';
import { RegionMap } from '../components/RegionMap';
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

  const existingRegions = useMemo(() =>
    data
      .filter((r) => {
        const geo = r.geojson as { type?: string; coordinates?: unknown };
        return geo?.type === 'Polygon' && geo.coordinates;
      })
      .map((r) => ({
        id: r.id,
        geojson: r.geojson,
        color: r.color,
        name: r.name,
      })),
    [data],
  );

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
        {existingRegions.length > 0 && (
          <div className="mb-4">
            <RegionMap
              existingRegions={existingRegions}
              editable={false}
              height="300px"
            />
          </div>
        )}
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
