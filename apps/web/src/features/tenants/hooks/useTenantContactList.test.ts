import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { useTenantContactList } from './useTenantContactList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTenantContactList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useTenantContactList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useTenantContactList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by confirmationStatus returns only matching contacts', () => {
    const { result } = renderHook(() => useTenantContactList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        confirmationStatus: TenantConfirmationStatus.CONFIRMED,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((contact) => {
      expect(contact.confirmationStatus).toBe(TenantConfirmationStatus.CONFIRMED);
    });
  });

  it('search filters by name/email/phone', () => {
    const { result } = renderHook(() => useTenantContactList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'ana.silva@email',
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.name).toBe('Ana Silva');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useTenantContactList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        confirmationStatus: TenantConfirmationStatus.NO_RESPONSE,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
