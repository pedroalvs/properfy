import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The hook reads the clock through the shared timezone helper. We fake only Date
// (not timers) at an instant where the UTC civil date and the Sydney civil date
// DIFFER — 15:00Z on 2026-10-27 is 02:00 on 2026-10-28 in Sydney (AEDT, UTC+11).
// That proves the window is computed in the agency timezone, never UTC/browser.
const FIXED_INSTANT = '2026-10-27T15:00:00Z';
// Expected civil "today" per timezone at that instant.
const TODAY_SYDNEY = '2026-10-28'; // Australia/Sydney, UTC+11 in late October
const TODAY_PERTH = '2026-10-27'; // Australia/Perth, UTC+8, no DST
// Default window (N=14, Sydney): 2026-10-28 .. +14 civil days.
const SYDNEY_FROM = TODAY_SYDNEY;
const SYDNEY_TO = '2026-11-11';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/tenants/hooks/useTenantAdminDetail', () => ({ useTenantAdminDetail: vi.fn() }));

import { useAuth } from '@/hooks/useAuth';
import { useTenantAdminDetail } from '@/features/tenants/hooks/useTenantAdminDetail';
import { useMapPeriodWindow } from './useMapPeriodWindow';

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockUseTenantDetail = useTenantAdminDetail as unknown as ReturnType<typeof vi.fn>;

function setAuth(role: string, tenantId: string | null) {
  mockUseAuth.mockReturnValue({ user: { role, tenantId } });
}

/** Default: no agency fetched (disabled query) → not loading, no tenant. */
function setNoAgency() {
  mockUseTenantDetail.mockReturnValue({ tenant: null, isLoading: false, isError: false, refetch: vi.fn() });
}

function setAgency(settingsJson: unknown, timezone: string | null, isLoading = false) {
  mockUseTenantDetail.mockReturnValue({
    tenant: isLoading ? null : { settingsJson, timezone },
    isLoading,
    isError: false,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FIXED_INSTANT));
  mockUseAuth.mockReset();
  mockUseTenantDetail.mockReset();
  setNoAgency();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMapPeriodWindow (F00)', () => {
  // H1 — AM, appointments mode, no agency filter → 14/Sydney, applied to the initial state.
  it('H1: AM with no agency seeds a 14-day Sydney window into appointment filters', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.windowDays.appointments).toBe(14);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
    // default non-date fields preserved.
    expect(result.current.appointmentFilters.statuses).toEqual(['DRAFT', 'REJECTED']);
  });

  // H2 — AM, groups window is always 14/Sydney (groups never fetch an agency).
  it('H2: groups window is always 14/Sydney', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.windowDays.groups).toBe(14);
    expect(result.current.groupFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.groupFilters.dateTo).toBe(SYDNEY_TO);
    expect(result.current.groupFilters.statuses).toEqual(['PUBLISHED', 'ACCEPTED']);
  });

  // H3 — CL agency with mapWindowDays=30 and a Perth timezone → 30-day Perth window.
  it('H3: CL agency drives N and timezone (30/Perth)', () => {
    setAuth('CL_ADMIN', 'own-agency');
    setAgency({ mapWindowDays: 30 }, 'Australia/Perth');
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.windowDays.appointments).toBe(30);
    expect(result.current.appointmentFilters.dateFrom).toBe(TODAY_PERTH);
    expect(result.current.appointmentFilters.dateTo).toBe('2026-11-26');
  });

  // H4 — CL appointments window is NOT ready while the agency GET is in flight (query gate).
  it('H4: appointmentWindowReady is false while the agency GET is loading', () => {
    setAuth('CL_ADMIN', 'own-agency');
    setAgency(null, null, /* isLoading */ true);
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.appointmentWindowReady).toBe(false);
  });

  // H5 — once the agency GET settles, the window is ready.
  it('H5: appointmentWindowReady becomes true once the agency GET settles', () => {
    setAuth('CL_ADMIN', 'own-agency');
    setAgency({ mapWindowDays: 30 }, 'Australia/Perth');
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.appointmentWindowReady).toBe(true);
  });

  // H5b — the agency GET is called with retry:false so a 500 falls back once, never retries.
  it('H5b: the agency detail query is called with { retry: false }', () => {
    setAuth('CL_ADMIN', 'own-agency');
    setAgency({ mapWindowDays: 30 }, 'Australia/Perth');
    renderHook(() => useMapPeriodWindow());
    expect(mockUseTenantDetail).toHaveBeenCalledWith('own-agency', { retry: false });
  });

  // H6 — AM with no agency is ready immediately (nothing to fetch).
  it('H6: AM with no agency is ready immediately', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.appointmentWindowReady).toBe(true);
  });

  // H7 — OP behaves like AM: no agency → 14/Sydney, ready immediately.
  it('H7: OP with no agency gets the 14/Sydney default', () => {
    setAuth('OP', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    expect(result.current.windowDays.appointments).toBe(14);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentWindowReady).toBe(true);
  });

  // H8 — AM switching the agency filter reapplies the window (never disables it).
  it('H8: AM agency switch keeps the window active and re-seeds dates', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => {
      result.current.onAppointmentFiltersChange({
        ...result.current.appointmentFilters,
        tenantId: 'agency-x',
      });
    });
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.tenantId).toBe('agency-x');
    // A window is still present (non-empty), not cleared by the switch.
    expect(result.current.appointmentFilters.dateFrom).not.toBe('');
    expect(result.current.appointmentFilters.dateTo).not.toBe('');
  });

  // H9 — removeWindow clears the appointments window (chip ✕).
  it('H9: removeWindow(appointments) clears the dates and deactivates the window', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => result.current.removeWindow('appointments'));
    expect(result.current.windowActive.appointments).toBe(false);
    expect(result.current.appointmentFilters.dateFrom).toBe('');
    expect(result.current.appointmentFilters.dateTo).toBe('');
  });

  // H10 — AM manual date edit: typed dates win and the window turns off (no clamp).
  it('H10: AM manual date edit disables the window and keeps the typed dates', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => {
      result.current.onAppointmentFiltersChange({
        ...result.current.appointmentFilters,
        dateFrom: '2026-12-01',
        dateTo: '2026-12-31',
      });
    });
    expect(result.current.windowActive.appointments).toBe(false);
    expect(result.current.appointmentFilters.dateFrom).toBe('2026-12-01');
    expect(result.current.appointmentFilters.dateTo).toBe('2026-12-31');
  });

  // H11 — resetDates re-applies the window after a removal.
  it('H11: resetDates(appointments) re-applies the window', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => result.current.removeWindow('appointments'));
    act(() => result.current.resetDates('appointments'));
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
  });

  // H12 — when the agency's N changes in the query cache, an active window reapplies.
  it('H12: a changed mapWindowDays in the cache reapplies the window', () => {
    setAuth('CL_ADMIN', 'own-agency');
    setAgency({ mapWindowDays: 30 }, 'Australia/Perth');
    const { result, rerender } = renderHook(() => useMapPeriodWindow());
    expect(result.current.appointmentFilters.dateTo).toBe('2026-11-26');
    // The agency settings update under the hook (same agency id, new N).
    setAgency({ mapWindowDays: 7 }, 'Australia/Perth');
    act(() => rerender());
    expect(result.current.windowDays.appointments).toBe(7);
    expect(result.current.appointmentFilters.dateFrom).toBe(TODAY_PERTH);
    expect(result.current.appointmentFilters.dateTo).toBe('2026-11-03');
  });

  // H13 — CL manual edit past the window end clamps to the window.
  it('H13: CL manual date edit clamps the end into the window', () => {
    setAuth('CL_USER', 'own-agency');
    setAgency({ mapWindowDays: 14 }, 'Australia/Sydney');
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => {
      result.current.onAppointmentFiltersChange({
        ...result.current.appointmentFilters,
        dateTo: '2026-12-31',
      });
    });
    // Window stays on for CL; the out-of-range end is clamped to the window end.
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
  });

  // H14 — CL manual edit before the window start clamps to the start.
  it('H14: CL manual date edit clamps the start into the window', () => {
    setAuth('CL_USER', 'own-agency');
    setAgency({ mapWindowDays: 14 }, 'Australia/Sydney');
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => {
      result.current.onAppointmentFiltersChange({
        ...result.current.appointmentFilters,
        dateFrom: '2026-01-01',
      });
    });
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
  });

  // H15 — a non-date, non-agency field change passes through untouched.
  it('H15: changing a non-date field leaves the window and dates intact', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => {
      result.current.onAppointmentFiltersChange({
        ...result.current.appointmentFilters,
        search: 'VST-42',
      });
    });
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.search).toBe('VST-42');
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
  });

  // H16 — clearing the agency filter (AM) reverts to the 14/Sydney default window.
  it('H16: clearing the agency filter reverts to 14/Sydney', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    // Switch to an agency, then clear it again.
    act(() => {
      result.current.onAppointmentFiltersChange({ ...result.current.appointmentFilters, tenantId: 'agency-x' });
    });
    act(() => {
      result.current.onAppointmentFiltersChange({ ...result.current.appointmentFilters, tenantId: '' });
    });
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
  });

  // H17 — removeWindow clears the groups window too.
  it('H17: removeWindow(groups) clears the group dates and deactivates it', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    act(() => result.current.removeWindow('groups'));
    expect(result.current.windowActive.groups).toBe(false);
    expect(result.current.groupFilters.dateFrom).toBe('');
    expect(result.current.groupFilters.dateTo).toBe('');
  });

  // H18 — re-emitting the SAME dates is a no-op: the window stays active.
  it('H18: re-emitting identical dates does not disable the window', () => {
    setAuth('AM', null);
    const { result } = renderHook(() => useMapPeriodWindow());
    const { dateFrom, dateTo } = result.current.appointmentFilters;
    act(() => {
      result.current.onAppointmentFiltersChange({ ...result.current.appointmentFilters, dateFrom, dateTo });
    });
    expect(result.current.windowActive.appointments).toBe(true);
    expect(result.current.appointmentFilters.dateFrom).toBe(SYDNEY_FROM);
    expect(result.current.appointmentFilters.dateTo).toBe(SYDNEY_TO);
  });
});
