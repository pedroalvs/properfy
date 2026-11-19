import type { ReactNode } from 'react';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@properfy/shared';
import { useCreatePropertyIssue } from '../useCreatePropertyIssue';

const mockApiPost = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ apiPost: (...args: unknown[]) => mockApiPost(...args) }));

let queryClient: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCreatePropertyIssue', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  });

  it('posts the issue with an Idempotency-Key and invalidates the lists + detail', async () => {
    mockApiPost.mockResolvedValue({ data: { id: 'issue-1' } });
    const { result } = renderHook(() => useCreatePropertyIssue('apt-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        body: { propertyId: 'p1', appointmentId: 'apt-1', reason: 'Broken window', photoFileIds: ['f1', 'f2'] },
        idempotencyKey: 'idem-1',
      });
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/property-issues',
      { propertyId: 'p1', appointmentId: 'apt-1', reason: 'Broken window', photoFileIds: ['f1', 'f2'] },
      { 'Idempotency-Key': 'idem-1' },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'property-issues', 'apt-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'property-files', 'apt-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'appointment', 'apt-1'] });
  });

  it('allows a zero-photo issue (reason alone, D27)', async () => {
    mockApiPost.mockResolvedValue({ data: { id: 'issue-2' } });
    const { result } = renderHook(() => useCreatePropertyIssue('apt-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        body: { propertyId: 'p1', appointmentId: 'apt-1', reason: 'No access' },
        idempotencyKey: 'idem-2',
      });
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/property-issues',
      { propertyId: 'p1', appointmentId: 'apt-1', reason: 'No access' },
      { 'Idempotency-Key': 'idem-2' },
    );
  });

  it('propagates a 409 photo-link conflict (no invalidation)', async () => {
    mockApiPost.mockRejectedValue(new ApiError(409, 'link failed', 'PROPERTY_ISSUE_PHOTO_LINK'));
    const { result } = renderHook(() => useCreatePropertyIssue('apt-1'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          body: { propertyId: 'p1', appointmentId: 'apt-1', reason: 'x', photoFileIds: ['f1'] },
          idempotencyKey: 'idem-3',
        });
      }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_PHOTO_LINK' });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
