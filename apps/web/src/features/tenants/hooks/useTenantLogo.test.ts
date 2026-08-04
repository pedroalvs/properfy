import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const { mockShowError, mockShowSuccess } = vi.hoisted(() => ({
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      messages: [],
      showError: mockShowError,
      showInfo: vi.fn(),
      showSuccess: mockShowSuccess,
      dismiss: vi.fn(),
    }),
  };
});

import { api } from '@/services/api';
import { useTenantLogo } from './useTenantLogo';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTenantLogo', () => {
  it('POSTs the file as raw multipart FormData and invalidates the tenant query', async () => {
    mockPost.mockResolvedValue({
      data: { data: { logoUrl: 'https://cdn.example.com/logo.png' } },
      error: undefined,
      response: { status: 200 },
    });

    const { result } = renderHook(() => useTenantLogo(TENANT_ID), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });
    let ok = false;
    await act(async () => {
      ok = await result.current.uploadLogo(file);
    });

    expect(ok).toBe(true);
    const [path, options] = mockPost.mock.calls[0]!;
    expect(path).toBe('/v1/tenants/{tenantId}/branding/logo');
    expect(options.params).toEqual({ path: { tenantId: TENANT_ID } });
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBe(file);
    // The serializer must pass FormData through untouched so the browser sets
    // the multipart boundary itself.
    expect(options.bodySerializer(options.body)).toBe(options.body);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tenant-admins'] });
    expect(mockShowSuccess).toHaveBeenCalledWith('Logo uploaded');
  });

  it('surfaces an upload error via snackbar and returns false', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'LOGO_FILE_INVALID', message: 'Logo must be a PNG…' } },
      response: { status: 400 },
    });

    const { result } = renderHook(() => useTenantLogo(TENANT_ID), {
      wrapper: createWrapper(),
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.uploadLogo(new File(['x'], 'x.png', { type: 'image/png' }));
    });

    expect(ok).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
  });

  it('DELETEs the logo and invalidates the tenant query', async () => {
    mockDelete.mockResolvedValue({
      data: { data: { deleted: true } },
      error: undefined,
      response: { status: 200 },
    });

    const { result } = renderHook(() => useTenantLogo(TENANT_ID), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    let ok = false;
    await act(async () => {
      ok = await result.current.removeLogo();
    });

    expect(ok).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('/v1/tenants/{tenantId}/branding/logo', {
      params: { path: { tenantId: TENANT_ID } },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tenant-admins'] });
    expect(mockShowSuccess).toHaveBeenCalledWith('Logo removed');
  });

  it('surfaces a delete error via snackbar and returns false', async () => {
    mockDelete.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'TENANT_LOGO_NOT_FOUND', message: 'No logo' } },
      response: { status: 404 },
    });

    const { result } = renderHook(() => useTenantLogo(TENANT_ID), {
      wrapper: createWrapper(),
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.removeLogo();
    });

    expect(ok).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
  });
});
