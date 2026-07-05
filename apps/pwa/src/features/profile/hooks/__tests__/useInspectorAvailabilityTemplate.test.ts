import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInspectorAvailabilityTemplate } from '../useInspectorAvailabilityTemplate';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

const mockApiGet = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const mockResponse: { data: InspectorAvailabilityResponse } = {
  data: {
    template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
    overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
  },
};

describe('useInspectorAvailabilityTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
  });

  it('calls the correct endpoint', async () => {
    mockApiGet.mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useInspectorAvailabilityTemplate(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith('/v1/inspectors/me/availability-template');
  });

  it('unwraps the data envelope', async () => {
    mockApiGet.mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useInspectorAvailabilityTemplate(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse.data);
  });

  it('returns loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInspectorAvailabilityTemplate(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useInspectorAvailabilityTemplate(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not fetch while the user is not loaded', () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockApiGet.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useInspectorAvailabilityTemplate(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
