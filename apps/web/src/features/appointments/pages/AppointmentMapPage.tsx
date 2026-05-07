import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type mapboxgl from 'mapbox-gl';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { MapContainer } from '@/components/map/MapContainer';
import { MapMarker } from '@/components/map/MapMarker';
import { MapPopup } from '@/components/map/MapPopup';
import { MapFloatingAction } from '@/components/map/MapFloatingAction';
import { computeBounds, isSinglePointBounds } from '@/lib/map-bounds';
import { formatDate } from '@/lib/format-date';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP, SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import type { AppointmentStatus, ServiceGroupStatus } from '@properfy/shared';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import {
  AppointmentMapFilterPanel,
  DEFAULT_APPOINTMENT_FILTERS,
  DEFAULT_GROUP_FILTERS,
  type FilterMode,
  type AppointmentModeFilters,
  type GroupModeFilters,
} from '../components/AppointmentMapFilterPanel';
import { MapLassoSelect, type LassoPoint } from '@/components/map/MapLassoSelect';
import { MapSelectionPanel } from '../components/MapSelectionPanel';
import { MapGroupCreateModal } from '@/features/service-groups/components/MapGroupCreateModal';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#E1BEE7',
  AWAITING_INSPECTOR: '#FFE0B2',
  SCHEDULED: '#2196F3',
  DONE: '#4CAF50',
  CANCELLED: '#EF5350',
  REJECTED: '#FF7043',
};

const GROUP_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#E1BEE7',
  PUBLISHED: '#FFE0B2',
  ACCEPTED: '#4CAF50',
  CANCELLED: '#EF5350',
  REJECTED: '#FF7043',
};

interface ServiceGroupMapAppointment {
  id: string;
  latitude: number;
  longitude: number;
}

interface ServiceGroupMapItem {
  id: string;
  name: string | null;
  status: string;
  groupSize: number;
  scheduledDate: string;
  appointments: ServiceGroupMapAppointment[];
}

type ServiceGroupMapPin = ServiceGroupMapItem & { latitude: number; longitude: number };

function computeGroupCentroid(
  appointments: ServiceGroupMapAppointment[],
): { latitude: number; longitude: number } | null {
  const valid = appointments.filter((a) => a.latitude != null && a.longitude != null);
  if (valid.length === 0) return null;
  return {
    latitude: valid.reduce((s, a) => s + a.latitude, 0) / valid.length,
    longitude: valid.reduce((s, a) => s + a.longitude, 0) / valid.length,
  };
}

export function AppointmentMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const tenantId = user?.tenantId ?? null;
  const isGlobalRole = hasRole('AM', 'OP');

  const [mode, setMode] = useState<FilterMode>('appointments');
  const [appointmentFilters, setAppointmentFilters] = useState<AppointmentModeFilters>(DEFAULT_APPOINTMENT_FILTERS);
  const [groupFilters, setGroupFilters] = useState<GroupModeFilters>(DEFAULT_GROUP_FILTERS);
  const [selectedItem, setSelectedItem] = useState<AppointmentMapItem | null>(null);
  const [selectedGroupItem, setSelectedGroupItem] = useState<ServiceGroupMapPin | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [lassoActive, setLassoActive] = useState(false);
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  // Appointment data — fetched when mode is 'appointments'
  const appointmentParams: ListParams = useMemo(() => ({
    page: 1,
    pageSize: 200,
    ...(appointmentFilters.statuses.length > 0 ? { status: appointmentFilters.statuses.join(',') } : {}),
    ...(appointmentFilters.search ? { search: appointmentFilters.search } : {}),
    ...(appointmentFilters.serviceTypeId ? { serviceTypeId: appointmentFilters.serviceTypeId } : {}),
    ...(appointmentFilters.branchId ? { branchId: appointmentFilters.branchId } : {}),
    ...(appointmentFilters.dateFrom ? { fromDate: appointmentFilters.dateFrom } : {}),
    ...(appointmentFilters.dateTo ? { toDate: appointmentFilters.dateTo } : {}),
    ...(appointmentFilters.timeSlot ? { timeSlot: appointmentFilters.timeSlot } : {}),
    ...(appointmentFilters.contactSearch ? { contactSearch: appointmentFilters.contactSearch } : {}),
    ...(appointmentFilters.confirmationStatus ? { confirmationStatus: appointmentFilters.confirmationStatus } : {}),
  }), [appointmentFilters]);

  const {
    data: appointmentResponse,
    isLoading: appointmentsLoading,
    isError: appointmentsError,
    error: appointmentsErrorObj,
    refetch: refetchAppointments,
  } = usePaginatedQuery<AppointmentMapItem>(
    ['appointments-map', mode],
    '/v1/appointments',
    appointmentParams,
    { enabled: mode === 'appointments' },
  );

  const appointmentData = useMemo(() => {
    const items = appointmentResponse?.data ?? [];
    if (appointmentFilters.showGrouped) return items;
    return items.filter((item) => !(item as any).serviceGroupId);
  }, [appointmentResponse, appointmentFilters.showGrouped]);

  // Group data — fetched when mode is 'groups'
  const groupParams: ListParams = useMemo(() => ({
    page: 1,
    pageSize: 200,
    includeAppointments: 'true',
    ...(groupFilters.statuses.length > 0 ? { status: groupFilters.statuses.join(',') } : {}),
    ...(groupFilters.search ? { search: groupFilters.search } : {}),
    ...(groupFilters.branchId ? { branchId: groupFilters.branchId } : {}),
    ...(groupFilters.dateFrom ? { scheduledDateFrom: groupFilters.dateFrom } : {}),
    ...(groupFilters.dateTo ? { scheduledDateTo: groupFilters.dateTo } : {}),
    ...(groupFilters.contactSearch ? { contactSearch: groupFilters.contactSearch } : {}),
  }), [groupFilters]);

  const {
    data: groupResponse,
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorObj,
    refetch: refetchGroups,
  } = usePaginatedQuery<ServiceGroupMapItem>(
    ['service-groups-map', mode],
    '/v1/service-groups',
    groupParams,
    { enabled: mode === 'groups' },
  );

  const groupData = groupResponse?.data ?? [];

  // Shared loading/error states
  const isLoading = mode === 'appointments' ? appointmentsLoading : groupsLoading;
  const isError = mode === 'appointments' ? appointmentsError : groupsError;
  const errorMessage = mode === 'appointments'
    ? appointmentsErrorObj?.message ?? null
    : groupsErrorObj?.message ?? null;
  const refetch = mode === 'appointments' ? refetchAppointments : refetchGroups;

  // Service type options
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'map-filter'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );

  // Branch options
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'map-filter', tenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(tenantId ? { tenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole && !!tenantId },
  );

  // Time slot options
  const { options: timeSlotOptions } = useFormOptions<{ id: string; label: string }>(
    ['time-slots', 'map-filter'],
    '/v1/appointment-time-slots',
    (item) => ({ value: item.id, label: item.label }),
  );

  // Auto-fit map bounds
  useEffect(() => {
    if (!mapInstance) return;
    const points = mode === 'appointments'
      ? appointmentData.map((item) => ({ latitude: item.latitude, longitude: item.longitude }))
      : groupData.flatMap((g) => {
          const c = computeGroupCentroid(g.appointments);
          return c ? [c] : [];
        });
    const bounds = computeBounds(points);
    if (!bounds) return;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      mapInstance.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
    } else {
      mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
  }, [appointmentData, groupData, mapInstance, mode]);

  // Keep popup position in sync
  const activeItem = mode === 'appointments' ? selectedItem : selectedGroupItem;
  const activeCoords = activeItem && 'latitude' in activeItem && activeItem.latitude != null && activeItem.longitude != null
    ? { lat: activeItem.latitude, lng: activeItem.longitude }
    : null;

  useEffect(() => {
    if (!mapInstance || !activeCoords) {
      setPopupPosition(null);
      return;
    }
    const update = () => {
      const { x, y } = mapInstance.project([activeCoords.lng, activeCoords.lat]);
      setPopupPosition({ x, y });
    };
    update();
    mapInstance.on('move', update);
    return () => { mapInstance.off('move', update); };
  }, [mapInstance, activeCoords?.lat, activeCoords?.lng]);

  // Clear selection on mode change
  useEffect(() => {
    setSelectedItem(null);
    setSelectedGroupItem(null);
  }, [mode]);

  const handleMarkerClick = useCallback((item: AppointmentMapItem) => {
    setSelectedItem(item);
    setSelectedGroupItem(null);
  }, []);

  const handleGroupMarkerClick = useCallback((item: ServiceGroupMapPin) => {
    setSelectedGroupItem(item);
    setSelectedItem(null);
  }, []);

  const handleListItemClick = useCallback((item: AppointmentMapItem) => {
    setSelectedItem(item);
    setSelectedGroupItem(null);
    if (mapInstance) {
      mapInstance.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        duration: 700,
      });
    }
  }, [mapInstance]);

  const handleGroupListItemClick = useCallback((item: ServiceGroupMapItem) => {
    const centroid = computeGroupCentroid(item.appointments);
    const pin: ServiceGroupMapPin | null = centroid ? { ...item, ...centroid } : null;
    setSelectedGroupItem(pin);
    setSelectedItem(null);
    if (mapInstance && centroid) {
      mapInstance.flyTo({
        center: [centroid.longitude, centroid.latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        duration: 700,
      });
    }
  }, [mapInstance]);

  const handleViewDetail = useCallback(
    (id: string) => {
      window.open(`/appointments/${id}`, '_blank');
    },
    [],
  );

  const handleViewGroupDetail = useCallback(
    (id: string) => {
      window.open(`/service-groups/${id}`, '_blank');
    },
    [],
  );

  const handleRecenter = useCallback(() => {
    setSelectedItem(null);
    setSelectedGroupItem(null);
  }, []);

  const handleLassoSelectionChange = useCallback((ids: string[]) => {
    setLassoSelectedIds(ids);
  }, []);

  const handleLassoDeactivate = useCallback(() => {
    setLassoActive(false);
  }, []);

  const handleToggleLasso = useCallback(() => {
    setLassoActive((prev) => !prev);
    if (lassoActive) {
      setLassoSelectedIds([]);
    }
  }, [lassoActive]);

  const handleClearLassoSelection = useCallback(() => {
    setLassoSelectedIds([]);
    setLassoActive(false);
  }, []);

  const handleOpenGroupModal = useCallback(() => {
    setGroupModalOpen(true);
  }, []);

  const handleGroupCreateSuccess = useCallback(() => {
    setGroupModalOpen(false);
    setLassoSelectedIds([]);
    setLassoActive(false);
    queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
    queryClient.invalidateQueries({ queryKey: ['service-groups-map'] });
  }, [queryClient]);

  const selectedAppointmentsForPanel = useMemo(
    () => appointmentData.filter((a) => lassoSelectedIds.includes(a.id)),
    [appointmentData, lassoSelectedIds],
  );

  // Side panel
  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-secondary">
          {mode === 'appointments' ? 'Appointments' : 'Service Groups'}
        </h2>
        <p className="text-xs text-text-muted">
          {mode === 'appointments'
            ? `${appointmentData.length} appointments on map`
            : `${groupData.length} groups on map`}
        </p>
      </div>

      <AppointmentMapFilterPanel
        mode={mode}
        onModeChange={setMode}
        appointmentFilters={appointmentFilters}
        onAppointmentFiltersChange={setAppointmentFilters}
        groupFilters={groupFilters}
        onGroupFiltersChange={setGroupFilters}
        serviceTypeOptions={serviceTypeOptions}
        branchOptions={branchOptions}
        timeSlotOptions={timeSlotOptions}
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />}

        {mode === 'appointments' && !isLoading && !isError && (
          <>
            {appointmentData.length === 0 && (
              <EmptyState title="No appointments with coordinates found" />
            )}
            {appointmentData.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                  selectedItem?.id === item.id ? 'bg-primary/5' : ''
                }`}
                onClick={() => handleListItemClick(item)}
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
          </>
        )}

        {mode === 'groups' && !isLoading && !isError && (
          <>
            {groupData.length === 0 && (
              <EmptyState title="No service groups found" />
            )}
            {groupData.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                  selectedGroupItem?.id === item.id ? 'bg-primary/5' : ''
                }`}
                onClick={() => handleGroupListItemClick(item)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-secondary">{item.name ?? '—'}</span>
                  <StatusChip
                    label={SERVICE_GROUP_STATUS_MAP[item.status as ServiceGroupStatus]?.label ?? item.status}
                    bg={SERVICE_GROUP_STATUS_MAP[item.status as ServiceGroupStatus]?.bg ?? '#E0E0E0'}
                  />
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {item.appointments.length} appointments
                </p>
                <p className="text-xs text-text-muted">{formatDate(item.scheduledDate)}</p>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // Map markers
  const validAppointmentPins = appointmentData.filter(
    (item): item is AppointmentMapItem & { latitude: number; longitude: number } =>
      item.latitude != null && item.longitude != null,
  );

  const validGroupPins = useMemo(
    (): ServiceGroupMapPin[] =>
      groupData
        .map((item) => {
          const centroid = computeGroupCentroid(item.appointments);
          if (!centroid) return null;
          return { ...item, ...centroid };
        })
        .filter((item): item is ServiceGroupMapPin => item !== null),
    [groupData],
  );

  const lassoPoints: LassoPoint[] = useMemo(
    () =>
      validAppointmentPins.map((item) => ({
        id: item.id,
        longitude: item.longitude,
        latitude: item.latitude,
      })),
    [validAppointmentPins],
  );

  const mapContent = (
    <div className="relative h-full">
      <MapContainer onMapReady={setMapInstance}>
        {mode === 'appointments' &&
          validAppointmentPins.map((item) => (
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
        {mode === 'groups' &&
          validGroupPins.map((item) => (
            <MapMarker
              key={item.id}
              longitude={item.longitude}
              latitude={item.latitude}
              color={GROUP_STATUS_COLORS[item.status] ?? '#9E9E9E'}
              label={item.name ?? ''}
              active={selectedGroupItem?.id === item.id}
              onClick={() => handleGroupMarkerClick(item)}
            />
          ))}
      </MapContainer>

      <MapLassoSelect
        map={mapInstance}
        points={lassoPoints}
        active={lassoActive && mode === 'appointments'}
        onSelectionChange={handleLassoSelectionChange}
        onDeactivate={handleLassoDeactivate}
      />

      {mode === 'appointments' && selectedItem && popupPosition && (
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

      {mode === 'groups' && selectedGroupItem && popupPosition && (
        <MapPopup
          title={selectedGroupItem.name ?? '—'}
          onClose={() => setSelectedGroupItem(null)}
          actions={[
            { label: 'View Details', onClick: () => handleViewGroupDetail(selectedGroupItem.id) },
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
              {SERVICE_GROUP_STATUS_MAP[selectedGroupItem.status as ServiceGroupStatus]?.label ?? selectedGroupItem.status}
            </p>
            <p>
              <span className="text-text-muted">Appointments:</span>{' '}
              {selectedGroupItem.appointments.length}
            </p>
            <p>
              <span className="text-text-muted">Date:</span>{' '}
              {formatDate(selectedGroupItem.scheduledDate)}
            </p>
          </div>
        </MapPopup>
      )}

      <MapFloatingAction
        actions={[
          ...(mode === 'appointments'
            ? [{ icon: 'mdi-selection-drag', label: 'Select Area', onClick: handleToggleLasso, active: lassoActive }]
            : []),
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
          { label: 'List View', icon: 'mdi-format-list-bulleted', onClick: () => navigate('/appointments/list') },
        ]}
      />
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} />

      <MapSelectionPanel
        selectedAppointments={selectedAppointmentsForPanel}
        onClearSelection={handleClearLassoSelection}
        onCreateGroup={handleOpenGroupModal}
      />

      <MapGroupCreateModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        selectedAppointmentIds={lassoSelectedIds}
        onSuccess={handleGroupCreateSuccess}
      />
    </div>
  );
}
