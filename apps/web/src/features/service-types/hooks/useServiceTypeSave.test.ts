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
import { useServiceTypeSave } from './useServiceTypeSave';
import type { ServiceTypeFormData } from '../types';
import { EMPTY_SERVICE_TYPE_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_DATA: ServiceTypeFormData = {
  code: 'ROUTINE_IN',
  name: 'Routine Ingoing',
  flowType: 'INGOING',
  requiresRentalTenantConfirmation: true,
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-st' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'st-01' } } });
});

describe('useServiceTypeSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });
    const errors = result.current.validate(EMPTY_SERVICE_TYPE_FORM);
    expect(errors.code).toBeDefined();
    expect(errors.name).toBeDefined();
    expect(errors.flowType).toBeDefined();
  });

  it('validate returns no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/service-types', { body: VALID_DATA });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'st-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/service-types/st-01', { body: VALID_DATA });
  });

  it('save returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

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
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

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
