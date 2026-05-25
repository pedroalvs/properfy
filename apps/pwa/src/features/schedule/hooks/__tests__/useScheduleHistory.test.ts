import { renderHook, waitFor } from '@testing-library/react';
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
  timeSlot: '08:00-12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  tenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED',
  agencyName: 'Test Agency',
};

const mockPaginatedResponse = {
  data: [doneItem],
  pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
};

describe('useScheduleHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the schedule endpoint with from/to/status=DONE params', async () => {
    mockApiGet.mockResolvedValue(mockPaginatedResponse);
    const { result } = renderHook(() => useScheduleHistory(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith(
      '/v1/inspector/schedule',
      expect.objectContaining({ status: 'DONE' }),
    );
  });

  it('returns the data array and pagination metadata', async () => {
    mockApiGet.mockResolvedValue(mockPaginatedResponse);
    const { result } = renderHook(() => useScheduleHistory(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].status).toBe('DONE');
    expect(result.current.data?.total).toBe(1);
  });

  it('returns loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useScheduleHistory(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useScheduleHistory(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
