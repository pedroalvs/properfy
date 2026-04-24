import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type mapboxgl from 'mapbox-gl';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { MapContainer } from '@/components/map/MapContainer';
import { MapMarker } from '@/components/map/MapMarker';
import { MapPopup } from '@/components/map/MapPopup';
import { MapFiltersPanel } from '@/components/map/MapFiltersPanel';
import { MapFloatingAction } from '@/components/map/MapFloatingAction';
import { computeBounds, isSinglePointBounds } from '@/lib/map-bounds';
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
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);

  // Auto-fit map bounds to visible pins whenever data or map readiness changes (FR-004).
  useEffect(() => {
    if (!mapInstance) return;
    const points = data.map((item) => ({ latitude: item.latitude, longitude: item.longitude }));
    const bounds = computeBounds(points);
    if (!bounds) return;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      mapInstance.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
    } else {
      mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
  }, [data, mapInstance]);

  // Keep popup screen position in sync with pin as the map pans/zooms.
  useEffect(() => {
    if (!mapInstance || !selectedItem) {
      setPopupPosition(null);
      return;
    }
    const update = () => {
      const { x, y } = mapInstance.project([selectedItem.longitude, selectedItem.latitude]);
      setPopupPosition({ x, y });
    };
    update();
    mapInstance.on('move', update);
    return () => { mapInstance.off('move', update); };
  }, [mapInstance, selectedItem]);

  const handleMarkerClick = useCallback((item: PropertyMapItem) => {
    setSelectedItem(item);
  }, []);

  const handleListItemClick = useCallback((item: PropertyMapItem) => {
    setSelectedItem(item);
    if (mapInstance) {
      mapInstance.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        duration: 700,
      });
    }
  }, [mapInstance]);

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
            onClick={() => handleListItemClick(item)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-secondary">{item.street}</span>
              <StatusChip
                label={PROPERTY_TYPE_MAP[item.type as PropertyType]?.label ?? item.type}
                bg={PROPERTY_TYPE_MAP[item.type as PropertyType]?.bg ?? '#E0E0E0'}
              />
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {item.suburb} {item.state} {item.postcode}
            </p>
            <p className="text-xs text-text-muted">{item.branchName}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const validPins = data.filter(
    (item): item is PropertyMapItem & { latitude: number; longitude: number } =>
      item.latitude != null && item.longitude != null,
  );

  const mapContent = (
    <div className="relative h-full">
      <MapContainer onMapReady={setMapInstance}>
        {validPins.map((item) => (
          <MapMarker
            key={item.id}
            longitude={item.longitude}
            latitude={item.latitude}
            color={TYPE_COLORS[item.type] ?? '#9E9E9E'}
            active={selectedItem?.id === item.id}
            onClick={() => handleMarkerClick(item)}
          />
        ))}
      </MapContainer>

      {selectedItem && popupPosition && (
        <MapPopup
          title={selectedItem.street}
          onClose={() => setSelectedItem(null)}
          actions={[
            { label: 'View Details', onClick: () => handleViewDetail(selectedItem.id) },
          ]}
          style={{
            left: popupPosition.x,
            top: popupPosition.y,
            transform: popupPosition.y > 220
              ? 'translate(-50%, calc(-100% - 14px))'
              : 'translate(-50%, 14px)',
          }}
        >
          <div className="space-y-1">
            <p>
              <span className="text-text-muted">Type:</span>{' '}
              {PROPERTY_TYPE_MAP[selectedItem.type as PropertyType]?.label ?? selectedItem.type}
            </p>
            <p>
              <span className="text-text-muted">Location:</span>{' '}
              {selectedItem.suburb} {selectedItem.state}
            </p>
            <p>
              <span className="text-text-muted">Branch:</span> {selectedItem.branchName}
            </p>
          </div>
        </MapPopup>
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
