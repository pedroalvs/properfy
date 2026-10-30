import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { todayInTzDateString, PLATFORM_TIMEZONE, MAP_WINDOW_DAYS_DEFAULT } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { useTenantAdminDetail } from '@/features/tenants/hooks/useTenantAdminDetail';
import {
  type AppointmentModeFilters,
  type GroupModeFilters,
  type FilterMode,
  buildDefaultAppointmentFilters,
  buildDefaultGroupFilters,
} from '../components/AppointmentMapFilterPanel';
import {
  resolveMapWindowDays,
  resolveWindowTimezone,
  computeWindowRange,
  clampRangeToWindow,
  type WindowRange,
} from '../lib/map-period-window';

export interface UseMapPeriodWindowResult {
  appointmentFilters: AppointmentModeFilters;
  groupFilters: GroupModeFilters;
  onAppointmentFiltersChange: (next: AppointmentModeFilters) => void;
  onGroupFiltersChange: (next: GroupModeFilters) => void;
  /** The appointments window has resolved (gate the /v1/appointments query + "Loading…" header). */
  appointmentWindowReady: boolean;
  /** Per-mode window on/off (AM/OP can turn it off; CL stays on). */
  windowActive: Record<FilterMode, boolean>;
  /** Per-mode N, for the chip/indicator labels. */
  windowDays: Record<FilterMode, number>;
  /** Per-mode window range (today..today+N), for CL date-input min/max. */
  windowRange: Record<FilterMode, WindowRange>;
  /** Chip ✕ (AM/OP): clear the window for a mode. */
  removeWindow: (mode: FilterMode) => void;
  /** Reset a mode's dates back to the current window (internal; no UI). */
  resetDates: (mode: FilterMode) => void;
}

/**
 * Owns the /map filter state and the default period window (F00). The first appointments request
 * is gated on `appointmentWindowReady` so it always carries today..today+N; the agency that drives
 * N/timezone is the filtered agency (AM/OP) or the user's own agency (CL), read from the agency GET
 * with `retry: false` — never `user.timezone`. Groups mode is always 14/Sydney (no agency filter).
 */
export function useMapPeriodWindow(): UseMapPeriodWindowResult {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';

  // Seed the window synchronously with the no-agency default (14/Sydney) so the first
  // appointments request already carries today..today+14 (M1). The agency path reapplies
  // the real N/timezone in the effect below, but it is gated by `appointmentWindowReady`
  // so those provisional dates never reach the wire for a role that fetches an agency.
  const [appointmentFilters, setAppointmentFilters] = useState<AppointmentModeFilters>(() =>
    buildDefaultAppointmentFilters(MAP_WINDOW_DAYS_DEFAULT, todayInTzDateString(PLATFORM_TIMEZONE)),
  );
  const [groupFilters, setGroupFilters] = useState<GroupModeFilters>(() =>
    buildDefaultGroupFilters(MAP_WINDOW_DAYS_DEFAULT, todayInTzDateString(PLATFORM_TIMEZONE)),
  );
  const [windowActive, setWindowActive] = useState<Record<FilterMode, boolean>>({
    appointments: true,
    groups: true,
  });

  // The agency whose settings drive the appointments window: the AM/OP agency filter, or the CL
  // user's own agency. Groups never fetches an agency.
  const appointmentAgencyId = isGlobalRole
    ? appointmentFilters.tenantId || null
    : user?.tenantId ?? null;

  const { tenant, isLoading } = useTenantAdminDetail(appointmentAgencyId, { retry: false });

  // Window inputs per mode. Appointments: the fetched agency (or 14/Sydney with no agency/on error).
  // Groups: always 14/Sydney.
  const appointmentWindowDays = appointmentAgencyId
    ? resolveMapWindowDays(tenant?.settingsJson)
    : MAP_WINDOW_DAYS_DEFAULT;
  const appointmentTimezone = appointmentAgencyId
    ? resolveWindowTimezone(tenant?.timezone)
    : PLATFORM_TIMEZONE;

  // Ready as soon as there is no agency to fetch; otherwise when the GET settles (success OR error,
  // retry disabled). React Query v5 isLoading is false while disabled, which is exactly "no fetch".
  const appointmentWindowReady = appointmentAgencyId ? !isLoading : true;

  // Memoised so they are stable deps for the result memo (a fresh object every
  // render would defeat it and trips react-hooks/exhaustive-deps).
  const windowDays: Record<FilterMode, number> = useMemo(
    () => ({ appointments: appointmentWindowDays, groups: MAP_WINDOW_DAYS_DEFAULT }),
    [appointmentWindowDays],
  );

  // The current window range per mode — the fixed bounds the CL date inputs clamp
  // to (min/max). Computed from the resolved N/timezone, so it tracks an agency
  // switch or a cache-side N change exactly as the applied dates do.
  const windowRange: Record<FilterMode, WindowRange> = useMemo(
    () => ({
      appointments: computeWindowRange(appointmentWindowDays, todayInTzDateString(appointmentTimezone)),
      groups: computeWindowRange(MAP_WINDOW_DAYS_DEFAULT, todayInTzDateString(PLATFORM_TIMEZONE)),
    }),
    [appointmentWindowDays, appointmentTimezone],
  );

  // Internal setter that applies the window without going through the manual-edit detection.
  const applyAppointmentWindow = useCallback((days: number, tz: string) => {
    const today = todayInTzDateString(tz);
    setAppointmentFilters((prev) => {
      const { from, to } = computeWindowRange(days, today);
      return { ...prev, dateFrom: from, dateTo: to };
    });
  }, []);

  const applyGroupWindow = useCallback(() => {
    const today = todayInTzDateString(PLATFORM_TIMEZONE);
    setGroupFilters((prev) => {
      const { from, to } = computeWindowRange(MAP_WINDOW_DAYS_DEFAULT, today);
      return { ...prev, dateFrom: from, dateTo: to };
    });
  }, []);

  // Groups window resolves immediately (14/Sydney): apply once on mount.
  const groupInitRef = useRef(false);
  useEffect(() => {
    if (groupInitRef.current) return;
    groupInitRef.current = true;
    if (windowActive.groups) applyGroupWindow();
  }, [applyGroupWindow, windowActive.groups]);

  // Appointments window: (re)apply whenever N/timezone resolves or changes, while active. Keyed on
  // the resolved inputs so an agency switch or an N change in the cache reapplies; a removed window
  // (active=false) is never reapplied.
  useEffect(() => {
    if (!appointmentWindowReady || !windowActive.appointments) return;
    applyAppointmentWindow(appointmentWindowDays, appointmentTimezone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentWindowReady, appointmentWindowDays, appointmentTimezone, windowActive.appointments, appointmentAgencyId]);

  const onAppointmentFiltersChange = useCallback(
    (next: AppointmentModeFilters) => {
      setAppointmentFilters((prev) => {
        // Agency switch → recompute/reapply the window (never disables it).
        if (next.tenantId !== prev.tenantId) {
          if (windowActive.appointments) {
            const agencyId = isGlobalRole ? next.tenantId || null : user?.tenantId ?? null;
            const days = agencyId && agencyId === appointmentAgencyId ? appointmentWindowDays : MAP_WINDOW_DAYS_DEFAULT;
            const tz = agencyId && agencyId === appointmentAgencyId ? appointmentTimezone : PLATFORM_TIMEZONE;
            // If the agency actually changed, the GET refetches and the effect above reapplies with
            // the real N/tz; apply the best-known window now so there is no gap.
            const today = todayInTzDateString(tz);
            const { from, to } = computeWindowRange(days, today);
            return { ...next, dateFrom: from, dateTo: to };
          }
          return next;
        }
        // Manual date edit.
        if (next.dateFrom !== prev.dateFrom || next.dateTo !== prev.dateTo) {
          if (isGlobalRole) {
            // AM/OP: the typed dates win and the window turns off.
            setWindowActive((w) => ({ ...w, appointments: false }));
            return next;
          }
          // CL: clamp into the window (state === request).
          const today = todayInTzDateString(appointmentTimezone);
          const clamped = clampRangeToWindow(
            { dateFrom: next.dateFrom, dateTo: next.dateTo },
            computeWindowRange(appointmentWindowDays, today),
          );
          return { ...next, dateFrom: clamped.dateFrom, dateTo: clamped.dateTo };
        }
        // Any other field: pass through untouched.
        return next;
      });
    },
    [isGlobalRole, user?.tenantId, appointmentAgencyId, appointmentWindowDays, appointmentTimezone, windowActive.appointments],
  );

  const onGroupFiltersChange = useCallback(
    (next: GroupModeFilters) => {
      setGroupFilters((prev) => {
        if (next.dateFrom !== prev.dateFrom || next.dateTo !== prev.dateTo) {
          // Groups is AM/OP only → manual edit turns the window off.
          setWindowActive((w) => ({ ...w, groups: false }));
          return next;
        }
        return next;
      });
    },
    [],
  );

  const removeWindow = useCallback((mode: FilterMode) => {
    setWindowActive((w) => ({ ...w, [mode]: false }));
    if (mode === 'appointments') {
      setAppointmentFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }));
    } else {
      setGroupFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }));
    }
  }, []);

  const resetDates = useCallback(
    (mode: FilterMode) => {
      setWindowActive((w) => ({ ...w, [mode]: true }));
      if (mode === 'appointments') {
        applyAppointmentWindow(appointmentWindowDays, appointmentTimezone);
      } else {
        applyGroupWindow();
      }
    },
    [applyAppointmentWindow, applyGroupWindow, appointmentWindowDays, appointmentTimezone],
  );

  return useMemo(
    () => ({
      appointmentFilters,
      groupFilters,
      onAppointmentFiltersChange,
      onGroupFiltersChange,
      appointmentWindowReady,
      windowActive,
      windowDays,
      windowRange,
      removeWindow,
      resetDates,
    }),
    [
      appointmentFilters,
      groupFilters,
      onAppointmentFiltersChange,
      onGroupFiltersChange,
      appointmentWindowReady,
      windowActive,
      windowDays,
      windowRange,
      removeWindow,
      resetDates,
    ],
  );
}
