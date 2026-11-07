import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type mapboxgl from 'mapbox-gl';
import { cn } from '@properfy/frontend-standards';
import {
  type LiveDayInspector,
  civilDateSchema,
  formatInstantTime,
  inspectorRouteColor,
} from '@properfy/shared';
import { MapContainer, MapMarker, MapScreenLayout, RouteLayer, computeMarkerOffsets } from '@/components/map';
import { computeBounds } from '@/lib/map-bounds';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLiveDay, type GeometryMode } from '../hooks/useLiveDay';
import { useEtaAccuracy } from '../hooks/useEtaAccuracy';
import { useFrozenOrder } from '../hooks/useFrozenOrder';
import { canShowAllRoutes, filterInspectors, routesToDraw, sortInspectors } from '../lib/liveDayView';
import { STATE_VISUALS } from '../lib/stateVisuals';
import { LiveDayPanel } from '../components/LiveDayPanel';
import { LiveDayLegend } from '../components/LiveDayLegend';

const PIN_COLLISION_DIAMETER = 36;
const SYDNEY_DEFAULT = { longitude: 151.2093, latitude: -33.8688, zoom: 10 };

function errorCode(error: unknown): string | undefined {
  return (error as { error?: { code?: string } } | null | undefined)?.error?.code;
}

function reducedMotionDuration(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 600;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
}

/** Short "last known" phrase for a pin's accessible name. */
function lastKnownShort(inspector: LiveDayInspector, fallbackTz: string): string {
  const { source, at, appointmentId } = inspector.lastKnown;
  if (source === 'BASE') return 'at base';
  if (source === 'NONE') return 'unknown';
  const verb = source === 'CHECK_OUT' ? 'check-out' : 'check-in';
  const tz = inspector.stops.find((s) => s.appointmentId === appointmentId)?.timezone ?? fallbackTz;
  return `${verb} at ${at ? formatInstantTime(at, tz) : ''}`;
}

function pinAriaLabel(inspector: LiveDayInspector, fallbackTz: string): string {
  const state = STATE_VISUALS[inspector.state].label;
  const { done, total } = inspector.progress;
  const delay =
    inspector.delayMinutes != null && inspector.delayMinutes > 0 ? `${inspector.delayMinutes} min late` : 'on time';
  return `${inspector.inspectorName} — ${state}, ${done} of ${total} done, ${delay}. Last known location: ${lastKnownShort(inspector, fallbackTz)}.`;
}

/**
 * Live Day (`/live-day`, AM/OP). Orchestrates the read, the URL state, the map
 * (pins, routes, camera) and the side panel. The 30s poll never moves the camera
 * and never carries geometry the screen is not drawing (D18).
 */
export function LiveDayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);
  const [vanishNotice, setVanishNotice] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusReturnRef = useRef<string | null>(null);

  const rawDate = searchParams.get('date');
  const date = rawDate != null && civilDateSchema.safeParse(rawDate).success ? rawDate : null;
  const selectedId = searchParams.get('inspector');
  const wantsAttention = searchParams.get('attention') === '1';
  const wantsRoutesAll = searchParams.get('routes') === 'all';
  const activeTab: 'inspectors' | 'locked' = searchParams.get('tab') === 'locked' ? 'locked' : 'inspectors';

  // The "all" request is gated by the client cap, which needs the roster, which
  // needs a first response. So the geometry mode is state, re-derived by an
  // effect once data is in: `all` only when "Show all routes" is on AND the
  // visible roster fits the cap; else `selected` when one is picked; else `none`.
  const [geometryMode, setGeometryMode] = useState<GeometryMode>(() => (selectedId ? 'selected' : 'none'));

  const { liveDay, isLoading, isFetching, isError, isRefetchError, dataUpdatedAt, isLive, error, refetch } = useLiveDay({
    date,
    geometryMode,
    selectedId,
  });
  const eta = useEtaAccuracy();

  useEffect(() => {
    const visibleCount = liveDay
      ? filterInspectors(liveDay.inspectors, { needsAttention: wantsAttention }).length
      : 0;
    const showAll = wantsRoutesAll && liveDay != null && canShowAllRoutes(visibleCount);
    setGeometryMode(showAll ? 'all' : selectedId ? 'selected' : 'none');
  }, [liveDay, wantsRoutesAll, wantsAttention, selectedId]);

  const isFarDateError = errorCode(error) === 'LIVE_DAY_DATE_TOO_FAR';

  // A date beyond tomorrow (400) → drop it (request today) and explain.
  useEffect(() => {
    if (isError && isFarDateError) {
      setRedirectNotice("That day isn't available yet. Showing today.");
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, isFarDateError]);

  // Once today's data is in after that redirect, pin the URL to today's civil date.
  useEffect(() => {
    if (redirectNotice && liveDay && !searchParams.get('date')) {
      const next = new URLSearchParams(searchParams);
      next.set('date', liveDay.today);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectNotice, liveDay]);

  const allInspectors = useMemo<LiveDayInspector[]>(() => liveDay?.inspectors ?? [], [liveDay]);
  const selectedInspector = selectedId ? allInspectors.find((i) => i.inspectorId === selectedId) ?? null : null;

  // Remember the last present selection (for the "no longer has work" notice).
  const lastSelectedRef = useRef<{ id: string; name: string; date: string } | null>(null);
  useEffect(() => {
    if (selectedInspector && liveDay) {
      lastSelectedRef.current = { id: selectedInspector.inspectorId, name: selectedInspector.inspectorName, date: liveDay.date };
    }
  }, [selectedInspector, liveDay]);

  // A selected inspector that is not on this day → clear the selection. Announce
  // it only when they vanished from the SAME day (a poll), not on a date change
  // or a bad deep link.
  useEffect(() => {
    if (!liveDay || !selectedId || selectedInspector) return;
    const prev = lastSelectedRef.current;
    if (prev && prev.id === selectedId && prev.date === liveDay.date) {
      setVanishNotice(`${prev.name} no longer has work on this day.`);
    }
    lastSelectedRef.current = null;
    const next = new URLSearchParams(searchParams);
    next.delete('inspector');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDay, selectedId, selectedInspector]);

  // Derived, display-side lists (current data).
  const filtered = sortInspectors(filterInspectors(allInspectors, { needsAttention: wantsAttention }));
  const resetKey = `${liveDay?.date ?? ''}:${wantsAttention}`;
  const visibleInspectors = useFrozenOrder(filtered, (i) => i.inspectorId, { isInteracting, resetKey });
  const canShowAll = canShowAllRoutes(filterInspectors(allInspectors, { needsAttention: wantsAttention }).length);

  // Focus the detail heading when an inspector is selected.
  useEffect(() => {
    if (selectedInspector) detailHeadingRef.current?.focus();
  }, [selectedInspector?.inspectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to the row after leaving the detail.
  useLayoutEffect(() => {
    if (!selectedInspector && focusReturnRef.current) {
      const id = focusReturnRef.current;
      focusReturnRef.current = null;
      const btn = document.querySelector<HTMLButtonElement>(`[data-inspector-row="${id}"] button`);
      btn?.focus();
    }
  }, [selectedInspector]);

  // Camera: fit all pins once per date; never on a poll.
  const fittedListRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapInstance || !liveDay || selectedInspector) return;
    const key = `list:${liveDay.date}`;
    if (fittedListRef.current === key) return;
    const points = allInspectors
      .filter((i) => i.lastKnown.source !== 'NONE' && i.lastKnown.lat != null && i.lastKnown.lng != null)
      .map((i) => ({ latitude: i.lastKnown.lat as number, longitude: i.lastKnown.lng as number }));
    const duration = reducedMotionDuration();
    if (points.length === 1) {
      mapInstance.flyTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 13, duration });
    } else if (points.length > 1) {
      const bounds = computeBounds(points);
      if (bounds) mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration });
    }
    fittedListRef.current = key;
  }, [mapInstance, liveDay, selectedInspector, allInspectors]);

  // Camera: fit the selected route once per selection; never on a poll.
  const fittedSelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapInstance || !selectedInspector || !liveDay) {
      if (!selectedInspector) fittedSelRef.current = null;
      return;
    }
    const key = `sel:${selectedInspector.inspectorId}:${liveDay.date}`;
    if (fittedSelRef.current === key) return;
    const points: Array<{ latitude: number; longitude: number }> = [];
    if (selectedInspector.origin) points.push({ latitude: selectedInspector.origin.lat, longitude: selectedInspector.origin.lng });
    for (const stop of selectedInspector.stops) {
      if (stop.lat != null && stop.lng != null) points.push({ latitude: stop.lat, longitude: stop.lng });
    }
    if (selectedInspector.lastKnown.lat != null && selectedInspector.lastKnown.lng != null) {
      points.push({ latitude: selectedInspector.lastKnown.lat, longitude: selectedInspector.lastKnown.lng });
    }
    const duration = reducedMotionDuration();
    if (points.length === 1) {
      mapInstance.flyTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 13, duration });
    } else if (points.length > 1) {
      const bounds = computeBounds(points);
      if (bounds) mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration });
    }
    fittedSelRef.current = key;
  }, [mapInstance, selectedInspector, liveDay]);

  // URL mutators.
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const handleDateChange = (newDate: string) => {
    setRedirectNotice(null);
    setVanishNotice(null);
    setParam('date', newDate || null);
  };
  const handleToday = () => {
    setRedirectNotice(null);
    setVanishNotice(null);
    setParam('date', liveDay?.today ?? null);
  };
  const handleSelect = (id: string) => {
    setVanishNotice(null);
    setParam('inspector', id);
  };
  const handleBack = () => {
    focusReturnRef.current = selectedId;
    setParam('inspector', null);
  };
  const handleToggleAttention = () => setParam('attention', wantsAttention ? null : '1');
  const handleToggleShowAll = () => setParam('routes', wantsRoutesAll ? null : 'all');
  const handleShowEveryone = () => setParam('attention', null);

  // Escape returns from the inspector detail to the list (keyboard, WCAG 2.1.1).
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  useEffect(() => {
    if (!selectedInspector) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleBackRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedInspector]);

  // ── Map layers ──────────────────────────────────────────────────────────────
  // The selected inspector must stay on the map even when a poll filters them out
  // of the list (e.g. their alert clears while "Needs attention" is on).
  const mapInspectors =
    selectedInspector && !visibleInspectors.some((i) => i.inspectorId === selectedInspector.inspectorId)
      ? [...visibleInspectors, selectedInspector]
      : visibleInspectors;
  const pinInspectors = mapInspectors.filter(
    (i) => i.lastKnown.source !== 'NONE' && i.lastKnown.lat != null && i.lastKnown.lng != null,
  );
  const offsets = computeMarkerOffsets(
    pinInspectors.map((i) => ({ id: i.inspectorId, latitude: i.lastKnown.lat as number, longitude: i.lastKnown.lng as number })),
    PIN_COLLISION_DIAMETER,
  );
  const drawShowAll = geometryMode === 'all';
  const routeList = routesToDraw(mapInspectors, {
    showAll: drawShowAll,
    selectedId: selectedInspector ? selectedId : null,
  }).filter((r) => r.inspector.geometryIncluded && r.inspector.geometry != null);

  const mapChildren = (
    <>
      {routeList.map(({ inspector, emphasis }) => {
        const color = inspectorRouteColor(inspector.inspectorId);
        const stopPoints = inspector.stops
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => [s.lng as number, s.lat as number] as [number, number]);
        return (
          <RouteLayer
            key={inspector.inspectorId}
            map={mapInstance}
            id={`live-route-${inspector.inspectorId}`}
            geometry={inspector.geometry}
            color={color.mapbox}
            emphasis={emphasis}
            label={inspector.inspectorName}
            onClick={() => handleSelect(inspector.inspectorId)}
            // The selected inspector shows numbered stop markers, so it never also gets dots.
            stops={drawShowAll && inspector.inspectorId !== selectedId ? { variant: 'dots', points: stopPoints } : undefined}
          />
        );
      })}

      {selectedInspector?.stops
        .filter((s) => s.lat != null && s.lng != null)
        .map((stop) => {
          const color = inspectorRouteColor(selectedInspector.inspectorId).hex;
          const isDone = stop.progress === 'DONE';
          return (
            <MapMarker
              key={stop.appointmentId}
              longitude={stop.lng as number}
              latitude={stop.lat as number}
              color={color}
              active={stop.progress === 'CURRENT'}
              innerIcon={isDone ? 'mdi-check-bold' : undefined}
              innerText={isDone ? undefined : stop.inPlan ? String(stop.sequence ?? '') : '•'}
              ariaLabel={`Stop ${stop.sequence ?? ''}, ${stop.appointmentCode}, ${stop.propertyAddress}`}
            />
          );
        })}

      {pinInspectors.map((inspector) => {
        const visual = STATE_VISUALS[inspector.state];
        const routeDrawn = drawShowAll || inspector.inspectorId === selectedId;
        return (
          <MapMarker
            key={inspector.inspectorId}
            longitude={inspector.lastKnown.lng as number}
            latitude={inspector.lastKnown.lat as number}
            icon={visual.icon}
            headColor={visual.headColor}
            outlineColor={routeDrawn ? inspectorRouteColor(inspector.inspectorId).hex : undefined}
            badge={inspector.needsAttention}
            label={inspector.inspectorName}
            ariaLabel={pinAriaLabel(inspector, liveDay?.timezone ?? 'Australia/Sydney')}
            offset={offsets.get(inspector.inspectorId)}
            onClick={() => handleSelect(inspector.inspectorId)}
          />
        );
      })}
    </>
  );

  // Parity with the drawn lines: list only the routes actually on the map.
  const legendRoutes = drawShowAll
    ? routeList.map(({ inspector }) => ({
        inspectorId: inspector.inspectorId,
        inspectorName: inspector.inspectorName,
        color: inspectorRouteColor(inspector.inspectorId).hex,
      }))
    : [];

  const map = (
    <>
      <MapContainer initialViewState={SYDNEY_DEFAULT} onMapReady={setMapInstance}>
        {mapChildren}
      </MapContainer>
      {/* Legend overlay. Desktop: bottom-right, always visible. Phones: top-left
          (clear of the bottom sheet and the top-right zoom control), collapsible. */}
      <div className="pointer-events-none absolute left-4 top-4 z-40 flex flex-col items-start gap-2 md:left-auto md:right-4 md:top-auto md:bottom-4 md:items-end">
        <button
          type="button"
          className="pointer-events-auto rounded-lg border border-border-subtle bg-card-bg/90 px-3 py-2 text-sm font-semibold text-text-primary shadow-lg backdrop-blur-sm md:hidden"
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((v) => !v)}
        >
          Legend
        </button>
        <div className={cn('pointer-events-auto', legendOpen ? 'block' : 'hidden', 'md:block')}>
          <LiveDayLegend showAll={drawShowAll} routes={legendRoutes} />
        </div>
      </div>
    </>
  );

  // ── Panel / states ──────────────────────────────────────────────────────────
  let sidePanel: JSX.Element;
  if (!liveDay && isLoading) {
    sidePanel = (
      <div className="flex flex-col gap-2 p-3" aria-busy="true" data-testid="live-day-skeleton">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-app-bg" />
        ))}
      </div>
    );
  } else if (!liveDay && isError && !isFarDateError) {
    sidePanel = (
      <EmptyState
        icon="mdi-alert-circle-outline"
        title="We couldn't load the Live Day."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    );
  } else if (liveDay) {
    sidePanel = (
      <>
        {vanishNotice && (
          <p role="status" className="bg-info/10 px-3 py-2 text-sm text-text-primary">
            {vanishNotice}
          </p>
        )}
        <LiveDayPanel
          data={liveDay}
          visibleInspectors={visibleInspectors}
          selectedInspector={selectedInspector}
          needsAttention={wantsAttention}
          showAll={drawShowAll}
          canShowAll={canShowAll}
          isLive={isLive}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
          pollError={isRefetchError}
          redirectNotice={redirectNotice}
          eta={eta}
          detailHeadingRef={detailHeadingRef}
          activeTab={activeTab}
          onTabChange={(tab) => setParam('tab', tab === 'locked' ? 'locked' : null)}
          onDateChange={handleDateChange}
          onToday={handleToday}
          onToggleAttention={handleToggleAttention}
          onToggleShowAll={handleToggleShowAll}
          onSelect={handleSelect}
          onBack={handleBack}
          onRetry={() => refetch()}
          onShowEveryone={handleShowEveryone}
          onInteractingChange={setIsInteracting}
        />
      </>
    );
  } else {
    sidePanel = <div className="p-3" aria-busy="true" data-testid="live-day-skeleton" />;
  }

  return <MapScreenLayout fillParent storageKey="live-day.panel.width" sidePanel={sidePanel} map={map} />;
}
