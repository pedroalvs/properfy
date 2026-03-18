import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { MapContainer } from '@/components/map/MapContainer';
import { MapMarker } from '@/components/map/MapMarker';
import { MapPopup } from '@/components/map/MapPopup';
import { MapFiltersPanel } from '@/components/map/MapFiltersPanel';
import { MapFloatingAction } from '@/components/map/MapFloatingAction';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterInput } from '@/components/filters/FilterInput';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { PROPERTY_TYPE_MAP } from '@/lib/status-colors';
import type { PropertyType } from '@properfy/shared';
import { usePropertyMapData, type PropertyMapItem } from '../hooks/usePropertyMapData';

const TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Industrial', value: 'INDUSTRIAL' },
  { label: 'Rural', value: 'RURAL' },
];

const TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: '#2196F3',
  COMMERCIAL: '#FF9800',
  INDUSTRIAL: '#795548',
  RURAL: '#4CAF50',
};

export function PropertyMapPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, errorMessage, refetch, filters, setFilters } =
    usePropertyMapData();
  const [selectedItem, setSelectedItem] = useState<PropertyMapItem | null>(null);

  const handleMarkerClick = useCallback((item: PropertyMapItem) => {
    setSelectedItem(item);
  }, []);

  const handleViewDetail = useCallback(
    (id: string) => {
      navigate(`/properties/${id}`);
    },
    [navigate],
  );

  const handleRecenter = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-secondary">Properties</h2>
        <p className="text-xs text-text-muted">{data.length} properties on map</p>
      </div>

      <MapFiltersPanel>
        <div className="flex flex-col gap-3">
          <FilterInput
            label="Search"
            value={filters.search}
            onChange={(value) => setFilters({ ...filters, search: value })}
            placeholder="Search address..."
          />
          <FilterSelect
            label="Type"
            value={filters.propertyType}
            options={TYPE_OPTIONS}
            onChange={(value) => setFilters({ ...filters, propertyType: value })}
          />
        </div>
      </MapFiltersPanel>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />}
        {!isLoading && !isError && data.length === 0 && (
          <EmptyState title="No properties with coordinates found" />
        )}
        {data.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
              selectedItem?.id === item.id ? 'bg-primary/5' : ''
            }`}
            onClick={() => handleMarkerClick(item)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-secondary">{item.address}</span>
              <StatusChip
                label={PROPERTY_TYPE_MAP[item.propertyType as PropertyType]?.label ?? item.propertyType}
                bg={PROPERTY_TYPE_MAP[item.propertyType as PropertyType]?.bg ?? '#E0E0E0'}
              />
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {item.suburb}, {item.city} {item.state} {item.postcode}
            </p>
            <p className="text-xs text-text-muted">{item.branchName}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const mapContent = (
    <div className="relative h-full">
      <MapContainer>
        {data.map((item) => (
          <MapMarker
            key={item.id}
            longitude={item.longitude}
            latitude={item.latitude}
            color={TYPE_COLORS[item.propertyType] ?? '#9E9E9E'}
            active={selectedItem?.id === item.id}
            onClick={() => handleMarkerClick(item)}
          />
        ))}
      </MapContainer>

      {selectedItem && (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2">
          <MapPopup
            title={selectedItem.address}
            onClose={() => setSelectedItem(null)}
            actions={[
              { label: 'View Details', onClick: () => handleViewDetail(selectedItem.id) },
            ]}
          >
            <div className="space-y-1">
              <p>
                <span className="text-text-muted">Type:</span>{' '}
                {PROPERTY_TYPE_MAP[selectedItem.propertyType as PropertyType]?.label ?? selectedItem.propertyType}
              </p>
              <p>
                <span className="text-text-muted">Location:</span>{' '}
                {selectedItem.suburb}, {selectedItem.city} {selectedItem.state}
              </p>
              <p>
                <span className="text-text-muted">Branch:</span> {selectedItem.branchName}
              </p>
            </div>
          </MapPopup>
        </div>
      )}

      <MapFloatingAction
        actions={[
          { icon: 'mdi-crosshairs-gps', label: 'Re-center', onClick: handleRecenter },
        ]}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Property Map"
        secondaryActions={[
          { label: 'List View', icon: 'mdi-format-list-bulleted', onClick: () => navigate('/properties') },
        ]}
      />
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} />
    </div>
  );
}
