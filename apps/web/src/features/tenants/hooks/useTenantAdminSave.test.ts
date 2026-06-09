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
import { useTenantAdminSave } from './useTenantAdminSave';
import type { TenantAdminFormData } from '../types';
import { EMPTY_TENANT_ADMIN_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_DATA: TenantAdminFormData = {
  name: 'Imob Alpha',
  legalName: 'Alpha LTDA',
  timezone: 'America/Sao_Paulo',
  currency: 'AUD',
  notes: '',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-tenant' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'ten-01' } } });
});

describe('useTenantAdminSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate(EMPTY_TENANT_ADMIN_FORM);
    expect(errors.name).toBeDefined();
    expect(errors.legalName).toBeDefined();
    expect(errors.timezone).toBeDefined();
    expect(errors.currency).toBeDefined();
  });

  it('validate returns no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate requires legalName', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, legalName: '' });
    expect(errors.legalName).toBeDefined();
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants', { body: VALID_DATA });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'ten-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/ten-01', { body: VALID_DATA });
  });

  it('save returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePost({ data: { data: { id: 'new' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
