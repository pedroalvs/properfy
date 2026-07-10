import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useScheduleHistory } from '../useScheduleHistory';

const mockApiGet = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

const doneItem = {
  id: '00000000-0000-0000-0000-000000000001',
  appointmentCode: 'INS-0001',
  status: 'DONE',
  scheduledDate: '2026-04-01',
  timeSlotStart: '08:00',
  timeSlotEnd: '12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED',
  agencyName: 'Test Agency',
  propertyAddress: '1 Test St',
  suburb: 'Suburb',
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
};

function makeResponse(page: number, totalPages: number) {
  return {
    data: [{ ...doneItem, id: `00000000-0000-0000-0000-00000000000${page}` }],
    pagination: { total: totalPages * 50, page, pageSize: 50, totalPages },
  };
}

describe('useScheduleHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the schedule endpoint with from/to/status=DONE and page params', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1));
    const { result } = renderHook(() => useScheduleHistory('24m'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith(
      '/v1/inspector/schedule',
      expect.objectContaining({
        status: 'DONE',
        page: '1',
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
  });

  it('flattens pages into items and exposes total', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1));
    const { result } = renderHook(() => useScheduleHistory('24m'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('DONE');
    expect(result.current.total).toBe(50);
  });

  it('fetches the next page and appends items', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeResponse(1, 2))
      .mockResolvedValueOnce(makeResponse(2, 2));
    const { result } = renderHook(() => useScheduleHistory('24m'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(mockApiGet).toHaveBeenLastCalledWith(
      '/v1/inspector/schedule',
      expect.objectContaining({ page: '2' }),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it('narrows the from date for the 30d period', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1));
    const { result } = renderHook(() => useScheduleHistory('30d'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const params = mockApiGet.mock.calls[0]?.[1] as { from: string; to: string };
    const from = new Date(`${params.from}T12:00:00`);
    const to = new Date(`${params.to}T12:00:00`);
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(diffDays).toBe(30);
  });

  it('does not fetch while disabled', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1));
    const { result } = renderHook(() => useScheduleHistory('24m', false), {
      wrapper: makeWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(0);
  });

  it('returns loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useScheduleHistory('24m'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toHaveLength(0);
  });

  it('returns error state on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useScheduleHistory('24m'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toHaveLength(0);
  });
});
