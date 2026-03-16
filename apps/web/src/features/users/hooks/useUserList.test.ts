import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { UserRole } from '@properfy/shared';
import { useUserList } from './useUserList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUserList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useUserList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useUserList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by role returns only matching users', () => {
    const { result } = renderHook(() => useUserList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        role: UserRole.INSP,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((user) => {
      expect(user.role).toBe(UserRole.INSP);
    });
  });

  it('search filters by name/email/phone', () => {
    const { result } = renderHook(() => useUserList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'ana@imobiliaria',
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.name).toBe('Ana Gestora');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useUserList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        role: UserRole.TNT,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
