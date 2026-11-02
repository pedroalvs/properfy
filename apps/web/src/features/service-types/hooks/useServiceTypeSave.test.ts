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
  defaultDurationMinutes: '45',
};

const CREATE_BODY = {
  code: 'ROUTINE_IN',
  name: 'Routine Ingoing',
  flowType: 'INGOING',
  requiresRentalTenantConfirmation: true,
  defaultDurationMinutes: 45,
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
    expect(errors.defaultDurationMinutes).toBe('Enter the duration in minutes');
  });

  it('validate returns no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate covers the duration bounds (5..480, whole minutes)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });
    const v = (defaultDurationMinutes: string) =>
      result.current.validate({ ...VALID_DATA, defaultDurationMinutes });
    expect(v('').defaultDurationMinutes).toBe('Enter the duration in minutes');
    expect(v('4').defaultDurationMinutes).toBe('Enter a duration between 5 and 480 minutes');
    expect(v('481').defaultDurationMinutes).toBe('Enter a duration between 5 and 480 minutes');
    expect(v('45.5').defaultDurationMinutes).toBe('Enter whole minutes');
    expect(v('5').defaultDurationMinutes).toBeUndefined();
    expect(v('480').defaultDurationMinutes).toBeUndefined();
    expect(v('60').defaultDurationMinutes).toBeUndefined();
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/service-types', { body: CREATE_BODY });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save({ ...VALID_DATA, defaultDurationMinutes: '50' }, 'st-01');
    });

    expect(saveResult?.success).toBe(true);
    // Typed path + params, and the update body omits the immutable `code` (#738).
    expect(mockPatch).toHaveBeenCalledWith('/v1/service-types/{serviceTypeId}', {
      params: { path: { serviceTypeId: 'st-01' } },
      body: {
        name: VALID_DATA.name,
        flowType: VALID_DATA.flowType,
        requiresRentalTenantConfirmation: VALID_DATA.requiresRentalTenantConfirmation,
        defaultDurationMinutes: 50,
      },
    });
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
