import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData } from '@tanstack/react-query';
import { createPortal } from 'react-dom';

import mapboxgl from 'mapbox-gl';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { MapContainer } from '@/components/map/MapContainer';
import { MapMarker } from '@/components/map/MapMarker';
import { MapFloatingAction } from '@/components/map/MapFloatingAction';
import { computeBounds, isSinglePointBounds } from '@/lib/map-bounds';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import type { ServiceGroupStatus } from '@properfy/shared';
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
import { MapFilterToggleButton } from '@/components/map/MapFilterToggleButton';
import { MapListViewToggleButton } from '@/components/map/MapListViewToggleButton';
import { MapBulkActionModal } from '../components/MapBulkActionModal';
import { MapAddToGroupSubModal } from '../components/MapAddToGroupSubModal';
import { AppointmentMapDetailPanel } from '../components/AppointmentMapDetailPanel';
import { MapGroupCreateModal } from '@/features/service-groups/components/MapGroupCreateModal';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@properfy/shared';

// Appointment pins are black teardrops; the status is encoded by the icon
// inside the pin (not by color). One MDI glyph per appointment status.
const STATUS_ICONS: Record<string, string> = {
  DRAFT: 'mdi-pencil',
  AWAITING_INSPECTOR: 'mdi-account-clock',
  SCHEDULED: 'mdi-calendar-check',
  DONE: 'mdi-check-bold',
  CANCELLED: 'mdi-cancel',
  REJECTED: 'mdi-close-octagon',
};

// Group pins follow the same standard as appointment pins: a black teardrop
// whose status is encoded by the icon inside it (not by color). Icons mirror
// the analogous appointment status glyph so the two modes read as one language.
export const GROUP_STATUS_ICONS: Record<ServiceGroupStatus, string> = {
  DRAFT: 'mdi-pencil',            // Awaiting Host      (≈ appt DRAFT)
  PUBLISHED: 'mdi-account-clock', // Awaiting Inspector (≈ appt AWAITING_INSPECTOR)
  ACCEPTED: 'mdi-calendar-check', // Accepted           (≈ appt SCHEDULED)
  CANCELLED: 'mdi-cancel',        // Canceled           (≈ appt CANCELLED)
  REJECTED: 'mdi-close-octagon',  // Rejected           (≈ appt REJECTED)
};

interface ServiceGroupMapAppointment {
  id: string;
  latitude: number;
  longitude: number;
}

interface ServiceGroupMapItem {
  id: string;
  name: string | null;
  status: ServiceGroupStatus;
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
 * Cycle 8 fix — "Show grouped" is an ADDITIVE toggle, not an exclusive switch:
 *   - `showGrouped = true`  → return ALL appointments (individual + grouped).
 *     The backend already returns all when ungroupedOnly is not set.
 *   - `showGrouped = false` → return ONLY the individual (non-grouped)
 *     appointments (backend also filters via ungroupedOnly=true for performance).
 *
 * Exported so `AppointmentMapPage.filter.test.ts` can pin the logic.
 */
export function filterAppointmentsByGrouping<T extends { serviceGroupId?: string | null }>(
  items: T[],
  showGrouped: boolean,
): T[] {
  if (showGrouped) {
    return items; // ALL — "include grouped" means show everything
  }
  return items.filter((item) => !item.serviceGroupId);
}

/**
 * Group-mode pin selection. With no group drilled into, the map shows the
 * group teardrops; once a group is selected, it shows that group's appointment
 * teardrops instead (and the group pins are hidden). Exported so
 * `AppointmentMapPage.group-modal.test.ts` can pin the swap logic without a
 * live Mapbox instance.
 */
export function selectGroupModePins(args: {
  selectedGroupId: string | null;
  groupPins: ServiceGroupMapPin[];
  groupAppointmentPins: AppointmentMapItem[];
}):
  | { kind: 'groups'; items: ServiceGroupMapPin[] }
  | { kind: 'appointments'; items: AppointmentMapItem[] } {
  if (args.selectedGroupId) {
    return { kind: 'appointments', items: args.groupAppointmentPins };
  }
  return { kind: 'groups', items: args.groupPins };
}

export function AppointmentMapPage() {

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const tenantId = user?.tenantId ?? null;
  const isGlobalRole = hasRole('AM', 'OP');

  // Seed the view mode from the URL once (?mode=groups). This lets other
  // screens deep-link straight into the groups view — e.g. the Service Groups
  // list "Map View" button -> /map?mode=groups. After mount, the in-panel
  // toggle owns `mode`; the URL is not kept in sync.
  //
  // Groups is an AM/OP-only surface (it reads /v1/service-groups and its List
  // view targets /service-groups, both AM/OP-gated), so only honour the
  // groups deep-link for global roles. Client roles stay on appointments.
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<FilterMode>(
    () => (searchParams.get('mode') === 'groups' && isGlobalRole ? 'groups' : 'appointments'),
  );
  const [appointmentFilters, setAppointmentFilters] = useState<AppointmentModeFilters>(DEFAULT_APPOINTMENT_FILTERS);
  const [groupFilters, setGroupFilters] = useState<GroupModeFilters>(DEFAULT_GROUP_FILTERS);
  const [selectedItem, setSelectedItem] = useState<AppointmentMapItem | null>(null);
  const [selectedGroupItem, setSelectedGroupItem] = useState<ServiceGroupMapPin | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  // 025 §FR-401 — lasso state machine replaces the boolean active flag.
  // 'idle' clears the polygon + draw control; 'drawing' enables the lasso;
  // 'review' keeps the polygon visible while the bulk modal is open;
  // 'applying' is the brief window during an in-flight bulk action.
  const [lassoState, setLassoState] = useState<LassoState>('idle');
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalSeedIds, setGroupModalSeedIds] = useState<string[]>([]);
  // 026 §FR-510 — Add-to-group sub-modal seeded from the bulk modal footer.
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [addToGroupSeedIds, setAddToGroupSeedIds] = useState<string[]>([]);
  // T-C4-4 — tracks bulk modal width so flyTo can pad right by modalWidth+32
  // to keep the focused marker visible beside the modal.
  const [bulkModalWidth, setBulkModalWidth] = useState(() => Math.round(window.innerWidth * 0.6));
  // Same idea for the group drill-down modal (tracked separately so each modal
  // keeps its own resized width).
  const [groupModalWidth, setGroupModalWidth] = useState(() => Math.round(window.innerWidth * 0.6));

  // 026 §FR-570 — Filter panel collapse + sessionStorage persistence.
  // Default CLOSED on first load; the toggle button at top-left re-opens
  // the panel. The state survives reload because the operator typically
  // re-uses the same filter set for several lasso passes.
  const FILTERS_STORAGE_KEY = 'appointments-map.filters.open';
  const [filtersOpen, setFiltersOpen] = useState(() => {
    try { return sessionStorage.getItem(FILTERS_STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const toggleFilters = useCallback(() => {
    setFiltersOpen((v) => {
      const next = !v;
      try { sessionStorage.setItem(FILTERS_STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);
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
    // ungroupedOnly: when the toggle is OFF, ask the backend to pre-filter so
    // only non-grouped appointments are returned (performance + semantic alignment).
    // When the toggle is ON the backend returns all and the client shows all.
    ...(appointmentFilters.showGrouped ? {} : { ungroupedOnly: true }),
    ...(appointmentFilters.statuses.length > 0 ? { status: appointmentFilters.statuses.join(',') } : {}),
    ...(appointmentFilters.search ? { search: appointmentFilters.search } : {}),
    ...(appointmentFilters.serviceTypeId ? { serviceTypeId: appointmentFilters.serviceTypeId } : {}),
    ...(appointmentFilters.branchId ? { branchId: appointmentFilters.branchId } : {}),
    ...(appointmentFilters.dateFrom ? { fromDate: appointmentFilters.dateFrom } : {}),
    ...(appointmentFilters.dateTo ? { toDate: appointmentFilters.dateTo } : {}),
    ...(appointmentFilters.timeSlot ? { timeSlot: appointmentFilters.timeSlot } : {}),
    ...(appointmentFilters.contactSearch ? { contactSearch: appointmentFilters.contactSearch } : {}),
    ...(appointmentFilters.confirmationStatus ? { confirmationStatus: appointmentFilters.confirmationStatus } : {}),
    ...(appointmentFilters.tenantId ? { tenantId: appointmentFilters.tenantId } : {}),
  }), [appointmentFilters]);

  const {
    data: appointmentResponse,
    isLoading: appointmentsLoading,
    isFetching: appointmentsFetching,
    isError: appointmentsError,
    error: appointmentsErrorObj,
    refetch: refetchAppointments,
  } = usePaginatedQuery<AppointmentMapItem>(
    ['appointments-map'],
    '/v1/appointments',
    appointmentParams,
    { enabled: true, placeholderData: keepPreviousData },
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
    isFetching: groupsFetching,
    isError: groupsError,
    error: groupsErrorObj,
    refetch: refetchGroups,
  } = usePaginatedQuery<ServiceGroupMapItem>(
    ['service-groups-map'],
    '/v1/service-groups',
    groupParams,
    // AM/OP-only endpoint — never fetch for client roles (avoids a 403 and a
    // wasted request; client roles can't reach groups mode anyway).
    { enabled: isGlobalRole, placeholderData: keepPreviousData },
  );

  const groupData = groupResponse?.data ?? [];

  // Group drill-down: when a group pin is clicked, fetch that group's FULL
  // appointments (same shape as the lasso bulk modal) so the modal renders the
  // rich columns and the pins drive the same rich detail panel. Enabled only
  // while a group is selected in groups mode; the empty `serviceGroupId` is
  // stripped by the query-params serializer when disabled.
  const drilledGroupId = mode === 'groups' ? selectedGroupItem?.id ?? null : null;
  const groupApptParams: ListParams = useMemo(
    () => ({ page: 1, pageSize: 100, serviceGroupId: drilledGroupId ?? '' }),
    [drilledGroupId],
  );
  const {
    data: groupApptResponse,
    isFetching: groupApptFetching,
  } = usePaginatedQuery<AppointmentMapItem>(
    ['appointments-by-group', drilledGroupId],
    '/v1/appointments',
    groupApptParams,
    { enabled: !!drilledGroupId, placeholderData: keepPreviousData },
  );
  const groupAppointments = useMemo(() => groupApptResponse?.data ?? [], [groupApptResponse]);

  // Shared loading/error states
  const isLoading = mode === 'appointments' ? appointmentsLoading : groupsLoading;
  const isFetching = mode === 'appointments' ? appointmentsFetching : groupsFetching;
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

  // Tenant options — AM only (cross-tenant Customers filter).
  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'map-filter'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
    { enabled: user?.role === 'AM' },
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
    '/v1/time-slots',
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

  // The rich appointment detail popup is available in Appointments mode AND
  // in the Groups drill-down (when a group is open). Same native popup, same
  // AppointmentMapDetailPanel — clicking an appointment pin or its code pill
  // opens it identically in both contexts.
  const appointmentDetailEnabled = mode === 'appointments' || !!selectedGroupItem;

  // 025 cycle 2/2 — Mapbox-native Popup for the appointment detail
  // panel. Creates the popup imperatively when an appointment is
  // selected; Mapbox handles the per-frame screen-position update via
  // CSS transforms so the popup tracks the marker through pan / zoom /
  // fitBounds without any React state change. `closeButton: false`
  // because the panel renders its own; `closeOnClick: false` because
  // the panel owns its own click-outside logic and we don't want a
  // single map click to dismiss the popup while the user is reading.
  useEffect(() => {
    if (!mapInstance || !appointmentDetailEnabled || !selectedItem
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
    // 025 cycle 3/2 — anchor omitted so Mapbox auto-chooses the side with
    // room around the marker. Pre-fix `anchor: 'bottom'` forced the popup
    // ABOVE the marker (the bottom edge of the popup anchored at the
    // lat/lng), which clipped at the top of the viewport for markers in
    // the upper third. Auto-anchor with a `'bottom'` preference is
    // Mapbox's default behaviour and what every native marker UI uses.
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
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
  }, [mapInstance, appointmentDetailEnabled, selectedItem?.id, selectedItem?.latitude, selectedItem?.longitude]);

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

  // Drill-down appointment-pin click: open the SAME rich detail panel as
  // Appointments mode, but DO NOT clear selectedGroupItem — we must stay in
  // the group view (unlike handleMarkerClick, which exits it). flyTo pads
  // right for the open group modal so the focused pin stays visible.
  const handleGroupAppointmentMarkerClick = useCallback((item: AppointmentMapItem) => {
    setSelectedItem(item);
    if (mapInstance && item.longitude != null && item.latitude != null) {
      mapInstance.flyTo({
        center: [item.longitude, item.latitude],
        zoom: Math.max(mapInstance.getZoom(), 15),
        duration: 600,
        padding: { right: groupModalWidth + 32 },
      });
    }
  }, [mapInstance, groupModalWidth]);

  // 026 cycle 1 devolução — sidePanel is filter-only now; the
  // appointments/groups list was removed because it duplicated the
  // post-lasso bulk modal's content. The handlers that powered the
  // inline-list-item clicks are gone with it.

  const handleViewDetail = useCallback(
    (id: string) => {
      window.open(`/appointments/${id}`, '_blank');
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

  // 026 §FR-510 — Add to existing group via the dedicated sub-modal.
  // The sub-modal calls the eligibility-check endpoint and surfaces a
  // per-appointment ineligibility banner before committing the add.
  const handleOpenAddToGroup = useCallback((ids: string[]) => {
    setAddToGroupSeedIds(ids);
    setAddToGroupOpen(true);
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
  // 026 cycle 1 devolução — sidePanel is now FILTER-ONLY.
  //  - The appointments/groups list that lived at the bottom is removed
  //    per user smoke: the canonical post-lasso list is the bulk-action
  //    modal; surfacing it twice was redundant and consumed the entire
  //    panel height blocking the filter inputs.
  //  - The filter region scrolls internally via the `flex-1 min-h-0
  //    overflow-y-auto` wrapper around `AppointmentMapFilterPanel`, so
  //    operators can reach every filter even when the panel is short.
  //  - `isLoading` / `isError` / refetch surface as a banner ABOVE the
  //    filters so the operator is never silently stuck on a stale view.
  const sidePanel = (
    <div className="flex h-full flex-col" data-testid="map-side-panel-content">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <h2 className="text-sm font-semibold text-text-primary">
          Filters{' '}
          <span className="font-normal text-text-muted">
            · {mode === 'appointments'
              ? `${appointmentData.length} appointments`
              : `${groupData.length} groups`}
          </span>
        </h2>
        <button
          type="button"
          onClick={toggleFilters}
          aria-label="Close filters panel"
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          data-testid="map-side-panel-close"
        >
          <i className="mdi mdi-close text-lg" />
        </button>
      </div>

      {isError && (
        <div className="border-b border-border-subtle px-4 py-2">
          <ErrorState message={errorMessage ?? 'Failed to load'} onRetry={refetch} />
        </div>
      )}
      {isFetching && !isLoading && (
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-border-subtle border-t-real-estate" aria-hidden="true" />
          <span className="text-xs text-text-muted">Updating…</span>
        </div>
      )}

      {/* The scrollable filter region. `min-h-0` is the documented escape
          hatch for flex children that need to scroll inside a flex parent —
          without it, `flex-1` reserves the natural content height and
          overflow-y-auto never engages. */}
      <div className="flex-1 min-h-0 overflow-y-auto" data-testid="map-side-panel-scroll">
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
          tenantOptions={tenantOptions}
          actorRole={actorRole}
        />
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

  // The drilled group's appointment pins (teardrops) — only those with coords.
  const validGroupApptPins = useMemo(
    () =>
      groupAppointments.filter(
        (item): item is AppointmentMapItem & { latitude: number; longitude: number } =>
          item.latitude != null && item.longitude != null,
      ),
    [groupAppointments],
  );

  // Groups mode renders EITHER the group teardrops (no drill-down) OR the
  // selected group's appointment teardrops (drill-down). Pure-helper driven so
  // the swap is unit-testable without a Mapbox instance.
  const groupModePins = useMemo(
    () =>
      selectGroupModePins({
        selectedGroupId: selectedGroupItem?.id ?? null,
        groupPins: validGroupPins,
        groupAppointmentPins: validGroupApptPins,
      }),
    [selectedGroupItem?.id, validGroupPins, validGroupApptPins],
  );

  // Fit the camera to the drilled group's appointment pins once they load.
  // Kept separate from the mode-level auto-fit (and from handleGroupMarkerClick,
  // whose flyTo is pinned by a regression guard) and given its OWN
  // once-per-group sentinel so a post-bulk-action refetch does not re-fit and
  // undo the operator's pan. Right-padded so pins clear the top-right modal.
  const hasFittedGroupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!drilledGroupId) {
      hasFittedGroupRef.current = null;
      return;
    }
    if (!mapInstance) return;
    if (hasFittedGroupRef.current === drilledGroupId) return;
    if (validGroupApptPins.length === 0) return;
    const bounds = computeBounds(
      validGroupApptPins.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    );
    if (!bounds) return;
    const rightPad = groupModalWidth + 32;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      mapInstance.flyTo({ center: [lng, lat], zoom: 15, duration: 600, padding: { right: rightPad } });
    } else {
      mapInstance.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: rightPad },
        maxZoom: 15,
        duration: 600,
      });
    }
    hasFittedGroupRef.current = drilledGroupId;
  }, [drilledGroupId, mapInstance, validGroupApptPins, groupModalWidth]);

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
              icon={STATUS_ICONS[item.status] ?? 'mdi-map-marker'}
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
        {mode === 'groups' && groupModePins.kind === 'groups' &&
          groupModePins.items.map((item) => (
            <MapMarker
              key={item.id}
              longitude={item.longitude}
              latitude={item.latitude}
              icon={GROUP_STATUS_ICONS[item.status] ?? 'mdi-map-marker'}
              label={item.name ?? ''}
              active={selectedGroupItem?.id === item.id}
              onClick={() => handleGroupMarkerClick(item)}
            />
          ))}
        {/* Group drill-down: the selected group's appointment pins replace the
            group pins. Same teardrop + detail-panel behaviour as Appointments
            mode, but clicking keeps the drill-down open. */}
        {mode === 'groups' && groupModePins.kind === 'appointments' &&
          groupModePins.items.map((item) => (
            <MapMarker
              key={item.id}
              longitude={item.longitude}
              latitude={item.latitude}
              icon={STATUS_ICONS[item.status] ?? 'mdi-map-marker'}
              label={item.code}
              active={selectedItem?.id === item.id}
              onClick={() => handleGroupAppointmentMarkerClick(item)}
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

      {/* Marker detail panel replaces the inline popup in appointments mode
          (025 §FR-451). Groups now open the floating group modal instead of a
          screen-pixel popup — see the MapBulkActionModal below. */}

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
    <div className="relative -mx-4 -mt-4 md:-mx-8 md:-mt-6">
      <MapScreenLayout sidePanel={sidePanel} map={mapContent} sidePanelOpen={filtersOpen} />
        {/* 026 cycle-1 devolução — render the top-left toggle ONLY while
            the panel is closed. When open, the panel's own close `×`
            button is the canonical affordance; the external toggle was
            occluding the panel header text. */}
        {!filtersOpen && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 md:left-6 md:top-6">
            <div className="pointer-events-auto">
              <MapFilterToggleButton open={filtersOpen} onToggle={toggleFilters} />
            </div>
          </div>
        )}

        {/* C10 — List view button: top-right, offset left of the Mapbox zoom controls */}
        <div className="pointer-events-none absolute right-14 top-4 z-30">
          <div className="pointer-events-auto">
            <MapListViewToggleButton mode={mode} />
          </div>
        </div>

      <MapBulkActionModal
        appointments={selectedAppointmentsForPanel}
        open={(lassoState === 'review' || lassoState === 'applying') && mode === 'appointments'}
        onClose={handleBulkModalClose}
        actorTimezone={actorTimezone}
        actorRole={actorRole}
        clUserFlags={clUserFlags}
        onAddToGroup={handleOpenAddToGroup}
        onCreateGroup={handleOpenCreateGroup}
        // T-C4-4 — track modal width so flyTo right-padding stays in sync
        onResize={setBulkModalWidth}
        // 026 §FR-560 + T-C4-4 — clicking the code pill opens the detail popup
        // and flies the map to the pin, padding right by the modal width.
        onOpenDetailPanel={(id) => {
          const item = appointmentData.find((a) => a.id === id) ?? null;
          if (!item) return;
          setSelectedItem(item);
          if (mapInstance && item.longitude != null && item.latitude != null) {
            mapInstance.flyTo({
              center: [item.longitude, item.latitude],
              zoom: 15,
              duration: 600,
              padding: { right: bulkModalWidth + 32 },
            });
          }
        }}
        onActionComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
          queryClient.invalidateQueries({ queryKey: ['service-groups-map'] });
        }}
      />

      {/* Group drill-down modal — the SAME floating bulk modal as the lasso
          flow, triggered by clicking a group pin and fed with that group's
          full appointments. While open, group pins are hidden and the group's
          appointment pins show on the map (see groupModePins). Group-creation
          footer buttons are hidden (rows already belong to a group). */}
      <MapBulkActionModal
        appointments={groupAppointments}
        open={mode === 'groups' && !!selectedGroupItem}
        isLoading={groupApptFetching}
        title={selectedGroupItem?.name ?? 'Group appointments'}
        emptyText="This group has no appointments."
        resizeStorageKey="appointments-map.group-modal.width"
        showGroupCreationActions={false}
        onClose={() => { setSelectedGroupItem(null); setSelectedItem(null); }}
        actorTimezone={actorTimezone}
        actorRole={actorRole}
        clUserFlags={clUserFlags}
        onResize={setGroupModalWidth}
        // Hidden in this context, but the props are required.
        onAddToGroup={() => {}}
        onCreateGroup={() => {}}
        onOpenDetailPanel={(id) => {
          const item = groupAppointments.find((a) => a.id === id) ?? null;
          if (!item) return;
          setSelectedItem(item); // keeps selectedGroupItem — stays in the drill-down
          if (mapInstance && item.longitude != null && item.latitude != null) {
            mapInstance.flyTo({
              center: [item.longitude, item.latitude],
              zoom: 15,
              duration: 600,
              padding: { right: groupModalWidth + 32 },
            });
          }
        }}
        onActionComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['appointments-by-group'] });
          queryClient.invalidateQueries({ queryKey: ['service-groups-map'] });
        }}
      />

      {/* 026 §FR-510 — Add-to-group sub-modal. Seeded from the modal
          footer button; runs eligibility-check on group pick, surfaces
          per-item ineligibles, commits with the eligible subset only. */}
      <MapAddToGroupSubModal
        open={addToGroupOpen}
        onClose={() => { setAddToGroupOpen(false); setAddToGroupSeedIds([]); }}
        appointments={addToGroupSeedIds.map((id) => appointmentData.find((a) => a.id === id)).filter(Boolean) as AppointmentMapItem[]}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
          queryClient.invalidateQueries({ queryKey: ['service-groups'] });
          setLassoSelectedIds([]);
          setLassoState('idle');
        }}
      />

      {/* 025 cycle 2/2 — appointment detail rendered inside a Mapbox-native
          Popup. The popup itself is created in the useEffect above and lives
          inside the map canvas's DOM tree; we portal the React content into
          the popup's root so Mapbox manages positioning per frame while
          React owns the content lifecycle. */}
      {appointmentDetailEnabled && selectedItem && appointmentPopupRoot && createPortal(
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
        selectedAppointments={(groupModalSeedIds.length > 0 ? groupModalSeedIds : lassoSelectedIds)
          .map((id) => appointmentData.find((a) => a.id === id))
          .filter(Boolean) as AppointmentMapItem[]}
        onSuccess={handleGroupCreateSuccess}
      />
    </div>
  );
}
