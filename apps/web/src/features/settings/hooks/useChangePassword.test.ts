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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useChangePassword } from './useChangePassword';
import { EMPTY_CHANGE_PASSWORD_FORM } from '../types';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

const VALID_DATA = {
  currentPassword: 'OldPass123!',
  newPassword: 'NewPass456@',
  confirmPassword: 'NewPass456@',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { success: true } });
});

describe('useChangePassword', () => {
  it('validate returns errors for empty form', () => {
    const { result } = renderHook(() => useChangePassword());
    const errors = result.current.validate(EMPTY_CHANGE_PASSWORD_FORM);
    expect(errors.currentPassword).toBeDefined();
    expect(errors.newPassword).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
  });

  it('validate returns no errors for valid data', () => {
    const { result } = renderHook(() => useChangePassword());
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate rejects password without uppercase', () => {
    const { result } = renderHook(() => useChangePassword());
    const errors = result.current.validate({ ...VALID_DATA, newPassword: 'newpass456@', confirmPassword: 'newpass456@' });
    expect(errors.newPassword).toBeDefined();
  });

  it('validate rejects mismatched passwords', () => {
    const { result } = renderHook(() => useChangePassword());
    const errors = result.current.validate({ ...VALID_DATA, confirmPassword: 'Different1!' });
    expect(errors.confirmPassword).toBe('Passwords do not match');
  });

  it('validate rejects short password', () => {
    const { result } = renderHook(() => useChangePassword());
    const errors = result.current.validate({ ...VALID_DATA, newPassword: 'Aa1!', confirmPassword: 'Aa1!' });
    expect(errors.newPassword).toContain('at least 8');
  });

  it('changePassword calls API and returns success', async () => {
    const { result } = renderHook(() => useChangePassword());
    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.changePassword(VALID_DATA);
    });
    expect(res?.success).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });

  it('changePassword returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Wrong password' } } });
    const { result } = renderHook(() => useChangePassword());
    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.changePassword(VALID_DATA);
    });
    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Wrong password');
  });
});
