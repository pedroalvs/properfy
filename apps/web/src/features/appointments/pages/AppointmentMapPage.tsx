import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
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
import { MapLassoSelect, type LassoPoint, type LassoState, type MapLassoSelectHandle } from '@/components/map/MapLassoSelect';
import { MapBulkActionModal } from '../components/MapBulkActionModal';
import { AppointmentMapDetailPanel } from '../components/AppointmentMapDetailPanel';
import { MapGroupCreateModal } from '@/features/service-groups/components/MapGroupCreateModal';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@properfy/shared';

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

/**
 * Issue #2 (UX smoke) — pure helper for the "Show grouped" filter so the
 * toggle behaviour is testable in isolation. The toggle is a SWITCH:
 *   - `showGrouped = true`  → return ONLY appointments with a
 *     `serviceGroupId` (i.e. members of a service group).
 *   - `showGrouped = false` → return ONLY the individual (non-grouped)
 *     appointments.
 * Exported so `AppointmentMapPage.test.tsx` can pin the logic without
 * needing to mock the full map render.
 */
export function filterAppointmentsByGrouping<T extends { serviceGroupId?: string | null }>(
  items: T[],
  showGrouped: boolean,
): T[] {
  if (showGrouped) {
    return items.filter((item) => Boolean(item.serviceGroupId));
  }
  return items.filter((item) => !item.serviceGroupId);
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
  // 025 §FR-401 — lasso state machine replaces the boolean active flag.
  // 'idle' clears the polygon + draw control; 'drawing' enables the lasso;
  // 'review' keeps the polygon visible while the bulk modal is open;
  // 'applying' is the brief window during an in-flight bulk action.
  const [lassoState, setLassoState] = useState<LassoState>('idle');
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalSeedIds, setGroupModalSeedIds] = useState<string[]>([]);
  // 025 cycle 2/2 — Mapbox-native Popup root for the appointment detail
  // panel. The popup is created imperatively (setLngLat + setDOMContent +
  // addTo) so Mapbox owns the screen-position update on every render
  // frame; we just portal the React content into the popup's DOM node.
  // Previous approach used React state + map.on('move') updates, which
  // produced visible decoupling for markers near viewport edges.
  const [appointmentPopupRoot, setAppointmentPopupRoot] = useState<HTMLDivElement | null>(null);
  const appointmentPopupRef = useRef<mapboxgl.Popup | null>(null);
  // 025 cycle 2/2 — imperative handle to MapLassoSelect so the page-level
  // banner UI (Finish / Cancel buttons) can drive the close gesture without
  // duplicating the polygon-completion logic.
  const lassoRef = useRef<MapLassoSelectHandle | null>(null);
  // Browser timezone — forwarded so the per-day idempotency bucket honours
  // the operator's local "today" instead of the server clock.
  const actorTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
  }, []);

  // Appointment data — fetched when mode is 'appointments'
  const appointmentParams: ListParams = useMemo(() => ({
    page: 1,
    pageSize: 100,
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

  const appointmentData = useMemo(
    () => filterAppointmentsByGrouping(
      (appointmentResponse?.data ?? []) as Array<AppointmentMapItem & { serviceGroupId?: string | null }>,
      appointmentFilters.showGrouped,
    ),
    [appointmentResponse, appointmentFilters.showGrouped],
  );

  // Group data — fetched when mode is 'groups'
  const groupParams: ListParams = useMemo(() => ({
    page: 1,
    pageSize: 100,
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

  // Clear stale map reference when mode changes (MapContainer is keyed by mode,
  // so the old Mapbox instance is destroyed and a new one created).
  useEffect(() => {
    return () => setMapInstance(null);
  }, [mode]);

  // Auto-fit map bounds — fires ONCE per (mode, map-instance) pair after
  // the first data load. 025 round-2 BUG-fix: the previous version fired
  // every time `appointmentData` reference changed, so a marker click
  // that triggered any react-query refetch (focus, invalidation, filter
  // tweak) zoomed the map back out to fit ALL pins, undoing the per-marker
  // `flyTo`. The Re-center floating action is the explicit way for the
  // operator to ask for a refit; the auto behaviour stays out of the way.
  const hasFittedRef = useRef<{ mode: FilterMode | null; map: mapboxgl.Map | null }>({ mode: null, map: null });
  useEffect(() => {
    if (!mapInstance) return;
    if (lassoState !== 'idle') return;
    if (hasFittedRef.current.mode === mode && hasFittedRef.current.map === mapInstance) return;
    const points = mode === 'appointments'
      ? appointmentData.map((item) => ({ latitude: item.latitude, longitude: item.longitude }))
      : groupData.flatMap((g) => {
          const c = computeGroupCentroid(g.appointments);
          return c ? [c] : [];
        });
    if (points.length === 0) return;
    const bounds = computeBounds(points);
    if (!bounds) return;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      mapInstance.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
    } else {
      mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
    hasFittedRef.current = { mode, map: mapInstance };
  }, [appointmentData, groupData, mapInstance, mode, lassoState]);

  // Reset the "has fitted" sentinel when the user switches modes so the
  // first load of the new mode auto-fits exactly once.
  useEffect(() => {
    hasFittedRef.current = { mode: null, map: null };
  }, [mode]);

  // Keep popup position in sync. Groups mode still uses the legacy
  // screen-pixel MapPopup; appointments mode uses the Mapbox-native
  // Popup wired below.
  const activeCoords = selectedGroupItem
      && 'latitude' in selectedGroupItem
      && selectedGroupItem.latitude != null
      && selectedGroupItem.longitude != null
    ? { lat: selectedGroupItem.latitude, lng: selectedGroupItem.longitude }
    : null;

  useEffect(() => {
    if (!mapInstance || !activeCoords || mode !== 'groups') {
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
  }, [mapInstance, activeCoords?.lat, activeCoords?.lng, mode]);

  // 025 cycle 2/2 — Mapbox-native Popup for the appointment detail
  // panel. Creates the popup imperatively when an appointment is
  // selected; Mapbox handles the per-frame screen-position update via
  // CSS transforms so the popup tracks the marker through pan / zoom /
  // fitBounds without any React state change. `closeButton: false`
  // because the panel renders its own; `closeOnClick: false` because
  // the panel owns its own click-outside logic and we don't want a
  // single map click to dismiss the popup while the user is reading.
  useEffect(() => {
    if (!mapInstance || mode !== 'appointments' || !selectedItem
        || selectedItem.latitude == null || selectedItem.longitude == null) {
      // Cleanup any existing popup if the selection cleared.
      if (appointmentPopupRef.current) {
        appointmentPopupRef.current.remove();
        appointmentPopupRef.current = null;
        setAppointmentPopupRoot(null);
      }
      return;
    }
    const root = document.createElement('div');
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      anchor: 'bottom',
      maxWidth: '380px',
      offset: 16,
      className: 'appt-map-detail-popup',
    })
      .setLngLat([selectedItem.longitude, selectedItem.latitude])
      .setDOMContent(root)
      .addTo(mapInstance);
    appointmentPopupRef.current = popup;
    setAppointmentPopupRoot(root);
    return () => {
      popup.remove();
      appointmentPopupRef.current = null;
      setAppointmentPopupRoot(null);
    };
  }, [mapInstance, mode, selectedItem?.id, selectedItem?.latitude, selectedItem?.longitude]);

  // Clear selection on mode change
  useEffect(() => {
    setSelectedItem(null);
    setSelectedGroupItem(null);
  }, [mode]);

  // Issue #3 (UX smoke): marker click on the map MUST focus the map on
  // the clicked pin — same affordance as the sidebar list-item handler
  // below. Pre-fix, the marker handler only updated selection state, so
  // a click on a far-away pin felt like a no-op (or worse, the popup
  // appeared off-screen and the user perceived a zoom-out). `flyTo`
  // with `Math.max(getZoom(), 14)` focuses without ever reducing zoom
  // — if the user is already zoomed in past 14, we keep their zoom.
  const handleMarkerClick = useCallback((item: AppointmentMapItem) => {
    setSelectedItem(item);
    setSelectedGroupItem(null);
    if (mapInstance && item.longitude != null && item.latitude != null) {
      mapInstance.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        duration: 700,
      });
    }
  }, [mapInstance]);

  const handleGroupMarkerClick = useCallback((item: ServiceGroupMapPin) => {
    setSelectedGroupItem(item);
    setSelectedItem(null);
    if (mapInstance && item.longitude != null && item.latitude != null) {
      mapInstance.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        duration: 700,
      });
    }
  }, [mapInstance]);

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
    // Explicit operator ask: re-fit camera to current data. Clear the
    // "has fitted" sentinel so the auto-fit useEffect runs again next tick.
    hasFittedRef.current = { mode: null, map: null };
    if (mapInstance) {
      const points = mode === 'appointments'
        ? appointmentData.map((item) => ({ latitude: item.latitude, longitude: item.longitude }))
        : groupData.flatMap((g) => {
            const c = computeGroupCentroid(g.appointments);
            return c ? [c] : [];
          });
      if (points.length > 0) {
        const bounds = computeBounds(points);
        if (bounds) {
          if (isSinglePointBounds(bounds)) {
            const [[lng, lat]] = bounds as [[number, number], [number, number]];
            mapInstance.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
          } else {
            mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
          }
          hasFittedRef.current = { mode, map: mapInstance };
        }
      }
    }
  }, [mapInstance, mode, appointmentData, groupData]);

  // 025 §FR-403 — when the lasso polygon completes, only re-fit the camera
  // if at least one selected pin is OUTSIDE the current viewport. Markers
  // that are already visible should not trigger a zoom — that was the
  // BUG-zoom-out behaviour the lasso state machine + this guard fixes.
  const handleLassoSelectionChange = useCallback((ids: string[]) => {
    setLassoSelectedIds(ids);
    if (ids.length === 0) {
      setLassoState('idle');
      return;
    }
    if (mapInstance) {
      const selectedPins = appointmentData
        .filter((a) => ids.includes(a.id))
        .filter((a): a is AppointmentMapItem & { latitude: number; longitude: number } =>
          a.latitude != null && a.longitude != null,
        );
      const viewport = mapInstance.getBounds();
      const anyOutside = viewport
        ? selectedPins.some((p) => {
            const lng = p.longitude;
            const lat = p.latitude;
            return (
              lng < viewport.getWest()
              || lng > viewport.getEast()
              || lat < viewport.getSouth()
              || lat > viewport.getNorth()
            );
          })
        : true;
      if (anyOutside) {
        const bounds = computeBounds(selectedPins);
        if (bounds) mapInstance.fitBounds(bounds, { padding: 100, maxZoom: 15, duration: 600 });
      }
    }
    setLassoState('review');
  }, [appointmentData, mapInstance]);

  const handleLassoToggle = useCallback(() => {
    setLassoState((prev) => {
      if (prev === 'idle') return 'drawing';
      // Any non-idle state → return to idle (cancels drawing or clears review).
      setLassoSelectedIds([]);
      return 'idle';
    });
  }, []);

  const handleLassoCleared = useCallback(() => {
    setLassoSelectedIds([]);
    setLassoState('idle');
  }, []);

  const handleBulkModalClose = useCallback(() => {
    setLassoSelectedIds([]);
    setLassoState('idle');
  }, []);

  const handleOpenAddToGroup = useCallback((ids: string[]) => {
    // Placeholder for MapAddToGroupModal — until that ships, route to the
    // existing MapGroupCreateModal seeded with the same ids so the operator
    // is never blocked. The plan calls for a dedicated picker; defer the
    // sub-modal in favour of unblocking the dominant happy path.
    setGroupModalSeedIds(ids);
    setGroupModalOpen(true);
  }, []);

  const handleOpenCreateGroup = useCallback((ids: string[]) => {
    setGroupModalSeedIds(ids);
    setGroupModalOpen(true);
  }, []);

  const handleGroupCreateSuccess = useCallback(() => {
    setGroupModalOpen(false);
    setGroupModalSeedIds([]);
    setLassoSelectedIds([]);
    setLassoState('idle');
    queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
    queryClient.invalidateQueries({ queryKey: ['service-groups-map'] });
  }, [queryClient]);

  // ESC handler — escape clears the polygon + closes the bulk modal when
  // the user is in 'review' state.
  useEffect(() => {
    if (lassoState !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLassoSelectedIds([]);
        setLassoState('idle');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lassoState]);

  const selectedAppointmentsForPanel = useMemo(
    () => appointmentData.filter((a) => lassoSelectedIds.includes(a.id)),
    [appointmentData, lassoSelectedIds],
  );

  // CL_USER tenant flags aren't exposed on the frontend auth context yet,
  // so the UI defaults to "no flags". Backend enforces the real check —
  // any denied row surfaces as a per-item FORBIDDEN in the result envelope,
  // and the user sees the row flagged in the modal summary.
  const clUserFlags = useMemo(
    () => ({ cancel_appointments: false, reject_appointments: false, reschedule_appointments: false }),
    [],
  );
  const actorRole: UserRole = (user?.role ?? 'CL_USER') as UserRole;

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

  // Per-mode cursor class on the map wrapper. While drawing a lasso the
  // cursor must be `crosshair` consistently — without an explicit class
  // the default canvas cursor (`grab`) bleeds through when the pointer
  // hovers React-rendered overlays (markers, labels, MapFloatingAction),
  // producing the cursor flicker the user reported.
  const mapWrapperClass = useMemo(() => {
    const base = 'relative h-full';
    if (lassoState === 'drawing') return `${base} appt-map-lasso-drawing`;
    if (lassoState === 'review' || lassoState === 'applying') return `${base} appt-map-lasso-review`;
    return base;
  }, [lassoState]);

  const mapContent = (
    <div className={mapWrapperClass} data-testid="appointment-map-wrapper">
      <MapContainer key={mode} onMapReady={setMapInstance}>
        {mode === 'appointments' &&
          validAppointmentPins.map((item) => (
            <MapMarker
              key={item.id}
              longitude={item.longitude}
              latitude={item.latitude}
              color={STATUS_COLORS[item.status] ?? '#9E9E9E'}
              label={item.code}
              active={selectedItem?.id === item.id}
              // Disable marker interaction while the operator is sketching
              // a lasso polygon. Without this, clicking near a marker to
              // close the polygon would land on the marker button, swallow
              // the click via stopPropagation, and leave the polygon
              // unclosed — exactly the "lasso impossible to close" bug.
              disabled={lassoState === 'drawing'}
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
        ref={lassoRef}
        map={mapInstance}
        points={lassoPoints}
        lassoState={mode === 'appointments' ? lassoState : 'idle'}
        onSelectionChange={handleLassoSelectionChange}
        onPolygonCleared={handleLassoCleared}
      />

      {/* 025 cycle 2/2 — explicit close affordance overlay. mapbox-gl-draw's
          default close gestures (click ~5px first vertex, dblclick, Enter)
          are undiscoverable. This top-center banner gives the operator
          visible Finish + Cancel buttons + a guidance line for the
          keyboard shortcuts. */}
      {mode === 'appointments' && lassoState === 'drawing' && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 transform"
          data-testid="lasso-draw-banner"
        >
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-orange-200 bg-white px-4 py-2 shadow-lg">
            <i className="mdi mdi-selection-drag text-base text-orange-500" />
            <span className="text-xs text-text-secondary">
              Click to add vertices · double-click or press <kbd className="rounded border border-gray-300 bg-gray-100 px-1 text-[10px]">Enter</kbd> to finish · <kbd className="rounded border border-gray-300 bg-gray-100 px-1 text-[10px]">Esc</kbd> to cancel
            </span>
            <div className="ml-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => lassoRef.current?.cancelDrawing()}
                className="rounded border border-border-subtle px-3 py-1 text-xs text-text-secondary hover:bg-gray-50"
                data-testid="lasso-banner-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => lassoRef.current?.finishDrawing()}
                className="rounded bg-orange-500 px-3 py-1 text-xs font-semibold text-white hover:brightness-95"
                data-testid="lasso-banner-finish"
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Marker detail panel replaces the inline popup in appointments mode (025 §FR-451). */}

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
            ? [{ icon: 'mdi-selection-drag', label: 'Select Area', onClick: handleLassoToggle, active: lassoState !== 'idle' }]
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

      <MapBulkActionModal
        appointments={selectedAppointmentsForPanel}
        open={(lassoState === 'review' || lassoState === 'applying') && mode === 'appointments'}
        onClose={handleBulkModalClose}
        actorTimezone={actorTimezone}
        actorRole={actorRole}
        clUserFlags={clUserFlags}
        onAddToGroup={handleOpenAddToGroup}
        onCreateGroup={handleOpenCreateGroup}
        onActionComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
          queryClient.invalidateQueries({ queryKey: ['service-groups-map'] });
        }}
      />

      {/* 025 cycle 2/2 — appointment detail rendered inside a Mapbox-native
          Popup. The popup itself is created in the useEffect above and lives
          inside the map canvas's DOM tree; we portal the React content into
          the popup's root so Mapbox manages positioning per frame while
          React owns the content lifecycle. */}
      {mode === 'appointments' && selectedItem && appointmentPopupRoot && createPortal(
        <AppointmentMapDetailPanel
          appointment={selectedItem}
          onClose={() => setSelectedItem(null)}
          onMoreDetails={handleViewDetail}
        />,
        appointmentPopupRoot,
      )}

      <MapGroupCreateModal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setGroupModalSeedIds([]); }}
        selectedAppointmentIds={groupModalSeedIds.length > 0 ? groupModalSeedIds : lassoSelectedIds}
        onSuccess={handleGroupCreateSuccess}
      />
    </div>
  );
}
