import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterMode } from '../components/AppointmentMapFilterPanel';

/** sessionStorage key for the filter-panel open flag (survives reloads). */
const FILTERS_STORAGE_KEY = 'appointments-map.filters.open';

export interface UseMapFilterPersistenceResult {
  mode: FilterMode;
  setMode: (mode: FilterMode) => void;
  filtersOpen: boolean;
  toggleFilters: () => void;
}

/**
 * WEB-8: owns the appointment-map view's small persistence surface, extracted
 * from `AppointmentMapPage`.
 *
 * - `mode` is seeded ONCE from `?mode=groups` (honoured only for AM/OP global
 *   roles — groups is an AM/OP surface); after mount the in-panel toggle owns
 *   it and the URL is deliberately NOT kept in sync.
 * - `filtersOpen` persists to sessionStorage so an operator's panel state
 *   survives reloads across several lasso passes. All storage access is
 *   try/catch-guarded (private windows / disabled storage default to closed).
 *
 * Note: `appointmentFilters` / `groupFilters` are plain unpersisted state and
 * stay with `useAppointmentMapState`, not here.
 */
export function useMapFilterPersistence({
  isGlobalRole,
}: {
  isGlobalRole: boolean;
}): UseMapFilterPersistenceResult {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<FilterMode>(
    () => (searchParams.get('mode') === 'groups' && isGlobalRole ? 'groups' : 'appointments'),
  );

  const [filtersOpen, setFiltersOpen] = useState(() => {
    try {
      return sessionStorage.getItem(FILTERS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleFilters = useCallback(() => {
    setFiltersOpen((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(FILTERS_STORAGE_KEY, String(next));
      } catch {
        /* noop — storage unavailable */
      }
      return next;
    });
  }, []);

  // Stable object so no consumer can trip the §13.11 referential-stability trap.
  return useMemo(
    () => ({ mode, setMode, filtersOpen, toggleFilters }),
    [mode, filtersOpen, toggleFilters],
  );
}
