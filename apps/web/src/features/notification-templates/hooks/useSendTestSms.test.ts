import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

import { api } from '@/services/api';
import { useSendTestSms } from './useSendTestSms';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
});

describe('useSendTestSms', () => {
  it('calls POST with correct path and body', async () => {
    mockPost.mockResolvedValue({ data: { data: { messageId: 'sms-123' } }, error: null });

    const { result } = renderHook(() => useSendTestSms());

    let res: Awaited<ReturnType<typeof result.current.sendTest>> | undefined;
    await act(async () => {
      res = await result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    expect(res?.success).toBe(true);
    expect(res?.messageId).toBe('sms-123');
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/notification-templates/INSPECTION_NOTICE_SMS/SMS/test-send',
      { body: { recipientPhone: '+61412345678' } },
    );
  });

  it('returns success=false and error message when API returns error', async () => {
    mockPost.mockResolvedValue({ data: null, error: { error: { message: 'Template not found' } } });

    const { result } = renderHook(() => useSendTestSms());

    let res: Awaited<ReturnType<typeof result.current.sendTest>> | undefined;
    await act(async () => {
      res = await result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Template not found');
  });

  it('returns success=false when fetch throws', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSendTestSms());

    let res: Awaited<ReturnType<typeof result.current.sendTest>> | undefined;
    await act(async () => {
      res = await result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toContain('Network error');
  });

  it('sets isSending=true while in flight and false after', async () => {
    let resolve: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useSendTestSms());

    act(() => {
      void result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    expect(result.current.isSending).toBe(true);

    await act(async () => {
      resolve!({ data: { data: { messageId: 'sms-x' } }, error: null });
    });

    expect(result.current.isSending).toBe(false);
  });

  it('re-entrancy guard: second call while in flight returns Already sending', async () => {
    let resolve: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useSendTestSms());

    act(() => {
      void result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    let secondRes: Awaited<ReturnType<typeof result.current.sendTest>> | undefined;
    await act(async () => {
      secondRes = await result.current.sendTest('INSPECTION_NOTICE_SMS', 'SMS', '+61412345678');
    });

    expect(secondRes?.success).toBe(false);
    expect(secondRes?.error).toBe('Already sending');

    await act(async () => {
      resolve!({ data: { data: { messageId: 'sms-x' } }, error: null });
    });
  });
});
