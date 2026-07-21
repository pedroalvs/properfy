import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => mockGet(...args) },
}));

import { useFormOptions } from './useFormOptions';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useFormOptions', () => {
  it('returns mapped options from a paginated endpoint', async () => {
    mockGet.mockResolvedValue({ data: {
      data: [
        { id: 'b-1', name: 'Branch A' },
        { id: 'b-2', name: 'Branch B' },
      ],
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    } });

    const { result } = renderHook(
      () =>
        useFormOptions<{ id: string; name: string }>(
          ['branches', 'form-options'],
          '/v1/branches',
          (item) => ({ value: item.id, label: item.name }),
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.options).toEqual([
      { value: 'b-1', label: 'Branch A' },
      { value: 'b-2', label: 'Branch B' },
    ]);

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/branches',
      { params: { query: expect.objectContaining({ pageSize: '100' }) } },
    );
  });

  it('returns empty options while loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () =>
        useFormOptions<{ id: string; name: string }>(
          ['branches', 'form-options-loading'],
          '/v1/branches',
          (item) => ({ value: item.id, label: item.name }),
        ),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.options).toEqual([]);
  });
});
