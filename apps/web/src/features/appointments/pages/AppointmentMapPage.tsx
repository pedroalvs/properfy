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
import { formatDate } from '@/lib/format-date';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterInput } from '@/components/filters/FilterInput';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import type { AppointmentStatus } from '@properfy/shared';
import { useAppointmentMapData, type AppointmentMapItem } from '../hooks/useAppointmentMapData';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Awaiting Inspector', value: 'AWAITING_INSPECTOR' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Done', value: 'DONE' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#E1BEE7',
  AWAITING_INSPECTOR: '#FFE0B2',
  SCHEDULED: '#2196F3',
  DONE: '#4CAF50',
  CANCELLED: '#EF5350',
  REJECTED: '#FF7043',
};

export function AppointmentMapPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, errorMessage, refetch, filters, setFilters } =
    useAppointmentMapData();
  const [selectedItem, setSelectedItem] = useState<AppointmentMapItem | null>(null);
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

  const handleMarkerClick = useCallback((item: AppointmentMapItem) => {
    setSelectedItem(item);
  }, []);

  const handleViewDetail = useCallback(
    (id: string) => {
      navigate(`/appointments/${id}`);
    },
    [navigate],
  );

  const handleRecenter = useCallback(() => {
    // Re-center would reset map view state
    setSelectedItem(null);
  }, []);

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-secondary">Appointments</h2>
        <p className="text-xs text-text-muted">{data.length} appointments on map</p>
      </div>

      <MapFiltersPanel>
        <div className="flex flex-col gap-3">
          <FilterSelect
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setFilters({ ...filters, status: value })}
          />
          <FilterInput
            label="From Date"
            value={filters.dateFrom}
            onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            placeholder="YYYY-MM-DD"
          />
          <FilterInput
            label="To Date"
            value={filters.dateTo}
            onChange={(value) => setFilters({ ...filters, dateTo: value })}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </MapFiltersPanel>

      {/* Appointment list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />}
        {!isLoading && !isError && data.length === 0 && (
          <EmptyState title="No appointments with coordinates found" />
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
              <span className="text-sm font-semibold text-secondary">{item.code}</span>
              <StatusChip
                label={APPOINTMENT_STATUS_MAP[item.status as AppointmentStatus]?.label ?? item.status}
                bg={APPOINTMENT_STATUS_MAP[item.status as AppointmentStatus]?.bg ?? '#E0E0E0'}
              />
            </div>
            <p className="mt-1 text-xs text-text-secondary">{item.propertyAddress}</p>
            <p className="text-xs text-text-muted">
              {formatDate(item.scheduledDate)} {item.timeSlot}
            </p>
          </button>
        ))}
      </div>
    </div>
  );

  const validPins = data.filter(
    (item): item is AppointmentMapItem & { latitude: number; longitude: number } =>
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
            color={STATUS_COLORS[item.status] ?? '#9E9E9E'}
            label={item.code}
            active={selectedItem?.id === item.id}
            onClick={() => handleMarkerClick(item)}
          />
        ))}
      </MapContainer>

      {selectedItem && popupPosition && (
        <MapPopup
          title={selectedItem.code}
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
              <span className="text-text-muted">Status:</span>{' '}
              {APPOINTMENT_STATUS_MAP[selectedItem.status as AppointmentStatus]?.label ?? selectedItem.status}
            </p>
            <p>
              <span className="text-text-muted">Address:</span> {selectedItem.propertyAddress}
            </p>
            <p>
              <span className="text-text-muted">Date:</span> {formatDate(selectedItem.scheduledDate)}
            </p>
            {selectedItem.inspectorName && (
              <p>
                <span className="text-text-muted">Inspector:</span>{' '}
                {selectedItem.inspectorName}
              </p>
            )}
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
        title="Appointment Map"
        secondaryActions={[
          { label: 'List View', icon: 'mdi-format-list-bulleted', onClick: () => navigate('/appointments') },
        ]}
      />
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} />
    </div>
  );
}
