import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { InspectorBaseAddress } from '@properfy/shared';
import { useDayPlanOrigin } from '../useDayPlanOrigin';
import { dayPlanKeys } from '../../api/day-plan-keys';
import { buildDayPlan } from '../../__fixtures__/day-plan';

const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/services/api', () => ({
  api: {
    PUT: (...args: unknown[]) => mockPut(...args),
    DELETE: (...args: unknown[]) => mockDelete(...args),
  },
}));

const showSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({ useSnackbar: () => ({ showSuccess, showError: vi.fn() }) }));

const DATE = '2026-11-05';
const ADDRESS: InspectorBaseAddress = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockPut.mockReset();
  mockDelete.mockReset();
  showSuccess.mockReset();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

describe('useDayPlanOrigin', () => {
  it('PUT replaces the cached plan and shows the override snackbar', async () => {
    const plan = buildDayPlan({ origin: { source: 'OVERRIDE', label: 'Sydney NSW 2000', lat: -33.87, lng: 151.2 } });
    mockPut.mockResolvedValue({ data: { data: plan }, error: undefined, response: { status: 200 } });

    const { result } = renderHook(() => useDayPlanOrigin(DATE), { wrapper });
    await act(async () => {
      await result.current.setOrigin(ADDRESS);
    });

    expect(mockPut).toHaveBeenCalledWith(
      `/v1/inspector/day-plans/${DATE}/origin`,
      expect.objectContaining({ body: { address: ADDRESS } }),
    );
    expect(client.getQueryData(dayPlanKeys.byDate(DATE))).toEqual({ data: plan });
    expect(showSuccess).toHaveBeenCalledWith('Route updated. Starting from Sydney NSW 2000 for this day.');
  });

  it('DELETE replaces the plan and shows the base-address snackbar', async () => {
    const plan = buildDayPlan();
    mockDelete.mockResolvedValue({ data: { data: plan }, error: undefined, response: { status: 200 } });

    const { result } = renderHook(() => useDayPlanOrigin(DATE), { wrapper });
    await act(async () => {
      await result.current.clearOrigin();
    });

    expect(mockDelete).toHaveBeenCalledWith(`/v1/inspector/day-plans/${DATE}/origin`, expect.anything());
    expect(client.getQueryData(dayPlanKeys.byDate(DATE))).toEqual({ data: plan });
    expect(showSuccess).toHaveBeenCalledWith('Route updated. Starting from your base address.');
  });

  it('surfaces the server error with the cache untouched', async () => {
    client.setQueryData(dayPlanKeys.byDate(DATE), { data: buildDayPlan() });
    mockPut.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'DAY_PLAN_ORIGIN_NOT_FOUND', message: "We couldn't find this address." } },
      response: { status: 422 },
    });

    const { result } = renderHook(() => useDayPlanOrigin(DATE), { wrapper });
    await act(async () => {
      await result.current.setOrigin(ADDRESS);
    });

    await waitFor(() => expect(result.current.error?.code).toBe('DAY_PLAN_ORIGIN_NOT_FOUND'));
    expect(result.current.error?.message).toBe("We couldn't find this address.");
    // cache unchanged (still the original plan)
    expect((client.getQueryData(dayPlanKeys.byDate(DATE)) as { data: { version: number } }).data.version).toBe(3);
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('coalesces a double submit to a single request', async () => {
    const plan = buildDayPlan();
    mockPut.mockResolvedValue({ data: { data: plan }, error: undefined, response: { status: 200 } });

    const { result } = renderHook(() => useDayPlanOrigin(DATE), { wrapper });
    await act(async () => {
      void result.current.setOrigin(ADDRESS);
      void result.current.setOrigin(ADDRESS);
      await Promise.resolve();
    });

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
  });
});
