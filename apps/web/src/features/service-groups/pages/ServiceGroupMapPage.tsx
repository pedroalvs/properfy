import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { SERVICE_GROUP_STATUS_MAP, PRIORITY_MODE_MAP } from '@/lib/status-colors';
import type { ServiceGroupStatus, PriorityMode, AppointmentStatus } from '@properfy/shared';
import { useServiceGroupMapData, type ServiceGroupMapItem } from '../hooks/useServiceGroupMapData';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Rejected', value: 'REJECTED' },
];

// Appointment-level status colors for map pins (matching AppointmentMapPage).
const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#E1BEE7',
  AWAITING_INSPECTOR: '#FFE0B2',
  SCHEDULED: '#2196F3',
  DONE: '#4CAF50',
  CANCELLED: '#EF5350',
  REJECTED: '#FF7043',
};

interface PopupAppointment {
  id: string;
  code: string;
  status: string;
  suburb: string;
  longitude: number;
  latitude: number;
  scheduledDate?: string;
  inspectorName?: string | null;
}

export function ServiceGroupMapPage() {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    selectedGroupId,
    setSelectedGroupId,
  } = useServiceGroupMapData();

  const [popupAppointment, setPopupAppointment] = useState<PopupAppointment | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);

  // All valid pins across all groups — enables "show all" behavior without requiring group selection.
  const allPins = useMemo(
    () =>
      data.flatMap((group) =>
        // Defensive: API may omit `appointments` when includeAppointments=false or for
        // groups with zero rows. Treat missing array as empty.
        (group.appointments ?? [])
          .filter(
            (apt): apt is typeof apt & { latitude: number; longitude: number } =>
              apt.latitude != null && apt.longitude != null,
          )
          .map((apt) => ({ ...apt, groupId: group.id })),
      ),
    [data],
  );

  // Auto-fit map bounds to all visible pins on initial load / filter change (matching AppointmentMapPage).
  useEffect(() => {
    if (!mapInstance) return;
    const bounds = computeBounds(allPins.map((p) => ({ latitude: p.latitude, longitude: p.longitude })));
    if (!bounds) return;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      mapInstance.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
    } else {
      mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
  }, [mapInstance, allPins]);

  // Keep popup screen position in sync with pin as the map pans/zooms (matching AppointmentMapPage).
  useEffect(() => {
    if (!mapInstance || !popupAppointment) {
      setPopupPosition(null);
      return;
    }
    const update = () => {
      const { x, y } = mapInstance.project([popupAppointment.longitude, popupAppointment.latitude]);
      setPopupPosition({ x, y });
    };
    update();
    mapInstance.on('move', update);
    return () => { mapInstance.off('move', update); };
  }, [mapInstance, popupAppointment]);

  const handleGroupClick = useCallback(
    (group: ServiceGroupMapItem) => {
      const nextId = group.id === selectedGroupId ? null : group.id;
      setSelectedGroupId(nextId);
      setPopupAppointment(null);

      if (nextId && mapInstance) {
        const validApts = (group.appointments ?? []).filter(
          (a): a is typeof a & { latitude: number; longitude: number } =>
            a.latitude != null && a.longitude != null,
        );
        const bounds = computeBounds(
          validApts.map((a) => ({ latitude: a.latitude, longitude: a.longitude })),
        );
        if (bounds) {
          if (isSinglePointBounds(bounds)) {
            const [[lng, lat]] = bounds as [[number, number], [number, number]];
            mapInstance.flyTo({
              center: [lng, lat],
              zoom: Math.max(mapInstance.getZoom(), 13),
              duration: 700,
            });
          } else {
            mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 700 });
          }
        }
      }
    },
    [selectedGroupId, setSelectedGroupId, mapInstance],
  );

  const handleRecenter = useCallback(() => {
    setPopupAppointment(null);
  }, []);

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-secondary">Service Groups</h2>
        <p className="text-xs text-text-muted">{data.length} groups</p>
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
          <FilterInput
            label="Search"
            value={filters.search}
            onChange={(value) => setFilters({ ...filters, search: value })}
            placeholder="Search groups..."
          />
        </div>
      </MapFiltersPanel>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />}
        {!isLoading && !isError && data.length === 0 && (
          <EmptyState title="No service groups found" />
        )}
        {data.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
              selectedGroupId === group.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
            }`}
            onClick={() => handleGroupClick(group)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-secondary">{group.name}</span>
              <StatusChip
                label={SERVICE_GROUP_STATUS_MAP[group.status as ServiceGroupStatus]?.label ?? group.status}
                bg={SERVICE_GROUP_STATUS_MAP[group.status as ServiceGroupStatus]?.bg ?? '#E0E0E0'}
              />
            </div>
            {group.regionName && (
              <p className="mt-1 text-xs text-text-secondary">{group.regionName}</p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {group.appointmentsCount} appointment{group.appointmentsCount !== 1 ? 's' : ''}
              </span>
              <StatusChip
                label={PRIORITY_MODE_MAP[group.priorityMode as PriorityMode]?.label ?? group.priorityMode}
                bg={PRIORITY_MODE_MAP[group.priorityMode as PriorityMode]?.bg ?? '#E0E0E0'}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const mapContent = (
    <div className="relative h-full">
      <MapContainer onMapReady={setMapInstance}>
        {allPins.map((apt) => (
          <MapMarker
            key={apt.id}
            longitude={apt.longitude}
            latitude={apt.latitude}
            color={APPOINTMENT_STATUS_COLORS[apt.status] ?? '#9E9E9E'}
            label={apt.code}
            active={
              selectedGroupId
                ? apt.groupId === selectedGroupId
                : popupAppointment?.id === apt.id
            }
            onClick={() =>
              setPopupAppointment({
                id: apt.id,
                code: apt.code,
                status: apt.status,
                suburb: apt.suburb,
                longitude: apt.longitude,
                latitude: apt.latitude,
                scheduledDate: apt.scheduledDate,
                inspectorName: apt.inspectorName,
              })
            }
          />
        ))}
      </MapContainer>

      {popupAppointment && popupPosition && (
        <MapPopup
          title={popupAppointment.code}
          onClose={() => setPopupAppointment(null)}
          actions={[
            { label: 'View Details', onClick: () => navigate(`/appointments/${popupAppointment.id}`) },
          ]}
          style={{
            left: popupPosition.x,
            top: popupPosition.y,
            transform:
              popupPosition.y > 220
                ? 'translate(-50%, calc(-100% - 14px))'
                : 'translate(-50%, 14px)',
          }}
        >
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <span className="text-text-muted">Status:</span>{' '}
              {/* UX-baseline cleanup: render via the canonical
                  AppointmentStatusChip so the popup matches the colour
                  language used in the appointments list / detail. */}
              <AppointmentStatusChip status={popupAppointment.status as AppointmentStatus} />
            </p>
            <p>
              <span className="text-text-muted">Suburb:</span> {popupAppointment.suburb}
            </p>
            {popupAppointment.scheduledDate && (
              <p>
                <span className="text-text-muted">Date:</span>{' '}
                {formatDate(popupAppointment.scheduledDate)}
              </p>
            )}
            {popupAppointment.inspectorName && (
              <p>
                <span className="text-text-muted">Inspector:</span>{' '}
                {popupAppointment.inspectorName}
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
        title="Service Group Map"
        secondaryActions={[
          { label: 'List View', icon: 'mdi-format-list-bulleted', onClick: () => navigate('/service-groups') },
        ]}
      />
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} />
    </div>
  );
}
