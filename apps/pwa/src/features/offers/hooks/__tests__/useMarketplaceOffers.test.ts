import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useMarketplaceOffers } from '../useMarketplaceOffers';

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

function makeOffer(id: string) {
  return {
    groupId: id,
    code: `GRP-${id}`,
    tenantName: 'Agency',
    serviceTypeName: 'Routine Inspection',
    groupSize: 1,
    appointmentCount: 1,
    scheduledDate: '2026-08-01',
    timeWindow: '09:00-11:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    suburbs: ['Brunswick'],
  };
}

function makeResponse(page: number, totalPages: number, total: number) {
  return {
    data: [makeOffer(`grp-p${page}`)],
    pagination: { total, page, pageSize: 100, totalPages },
  };
}

describe('useMarketplaceOffers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the offers endpoint with explicit page/pageSize (backend defaults to 20 otherwise)', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1, 1));
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith('/v1/marketplace/offers', {
      page: '1',
      pageSize: '100',
    });
  });

  it('flattens pages into offers and exposes total', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1, 1));
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.offers).toHaveLength(1);
    expect(result.current.offers[0]?.groupId).toBe('grp-p1');
    expect(result.current.total).toBe(1);
  });

  it('appends the next page on fetchNextPage and stops when exhausted', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeResponse(1, 2, 2))
      .mockResolvedValueOnce(makeResponse(2, 2, 2));
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.offers).toHaveLength(2));
    expect(result.current.offers.map((offer) => offer.groupId)).toEqual(['grp-p1', 'grp-p2']);
    expect(result.current.hasNextPage).toBe(false);
    expect(mockApiGet).toHaveBeenLastCalledWith('/v1/marketplace/offers', {
      page: '2',
      pageSize: '100',
    });
  });

  it('reports no next page for a single-page result', async () => {
    mockApiGet.mockResolvedValue(makeResponse(1, 1, 1));
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});
