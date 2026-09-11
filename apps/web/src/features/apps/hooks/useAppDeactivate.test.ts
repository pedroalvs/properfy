import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useAppDeactivate } from './useAppDeactivate';

vi.mock('@/services/api', () => ({ api: { POST: vi.fn(), PATCH: vi.fn() } }));

const APP_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('useAppDeactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivate POSTs the typed deactivate route with no body', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.POST).mockResolvedValue({ data: undefined, error: undefined } as never);
    const { result } = renderHook(() => useAppDeactivate(), { wrapper: createQueryWrapper() });

    const res = await result.current.deactivate(APP_ID);

    expect(res.success).toBe(true);
    const [path, options] = vi.mocked(api.POST).mock.calls[0]!;
    expect(path).toBe('/v1/app-credentials/{id}/deactivate');
    expect(options).toEqual({ params: { path: { id: APP_ID } } });
    // The generated route has requestBody?: never — no body must be sent.
    expect(options).not.toHaveProperty('body');
  });

  it('reactivate PATCHes the typed route with { isActive: true }', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.PATCH).mockResolvedValue({ data: undefined, error: undefined } as never);
    const { result } = renderHook(() => useAppDeactivate(), { wrapper: createQueryWrapper() });

    const res = await result.current.reactivate(APP_ID);

    expect(res.success).toBe(true);
    const [path, options] = vi.mocked(api.PATCH).mock.calls[0]!;
    expect(path).toBe('/v1/app-credentials/{id}');
    expect(options).toMatchObject({ params: { path: { id: APP_ID } }, body: { isActive: true } });
  });

  it('invalidates the app-credentials query on success', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.POST).mockResolvedValue({ data: undefined, error: undefined } as never);
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { result } = renderHook(() => useAppDeactivate(), { wrapper: createQueryWrapper() });

    await result.current.deactivate(APP_ID);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['app-credentials'] });
    invalidateSpy.mockRestore();
  });

  it('surfaces the error envelope code/message and does not invalidate on failure', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'APP_CREDENTIAL_NOT_FOUND', message: 'App credential not found' } },
    } as never);
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { result } = renderHook(() => useAppDeactivate(), { wrapper: createQueryWrapper() });

    const res = await result.current.deactivate(APP_ID);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('APP_CREDENTIAL_NOT_FOUND');
    expect(res.errorMessage).toBe('App credential not found');
    expect(invalidateSpy).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });
});
