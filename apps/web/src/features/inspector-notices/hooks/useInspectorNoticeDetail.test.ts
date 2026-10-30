import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useInspectorNoticeDetail } from './useInspectorNoticeDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
});

describe('useInspectorNoticeDetail', () => {
  it('fetches the notice by id', async () => {
    mockGet.mockResolvedValue({ data: { data: { id: 'n1', title: 'Road closure', recipients: [] } } });
    const { result } = renderHook(() => useInspectorNoticeDetail('n1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.notice?.id).toBe('n1'));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-notices/n1', expect.anything());
    expect(result.current.notFound).toBe(false);
  });

  it('does not fetch when id is null', async () => {
    const { result } = renderHook(() => useInspectorNoticeDetail(null), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('flags a 404 as notFound', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'INSPECTOR_NOTICE_NOT_FOUND', message: 'nope' } }, response: { status: 404 } });
    const { result } = renderHook(() => useInspectorNoticeDetail('missing'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });
});
