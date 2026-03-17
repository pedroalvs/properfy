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
import { useServiceGroupSave } from './useServiceGroupSave';
import type { ServiceGroupFormData } from '../types';
import { EMPTY_SERVICE_GROUP_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_CREATE_DATA: ServiceGroupFormData = {
  name: 'Teste Grupo',
  regionName: 'São Paulo - Centro',
  priorityMode: 'STANDARD',
  description: 'Descrição de teste',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-sg' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'sg-01' } } });
});

describe('useServiceGroupSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });
    const errors = result.current.validate(EMPTY_SERVICE_GROUP_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.priorityMode).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate accepts empty optional fields (regionName, description)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      regionName: '',
      description: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/service-groups', { body: VALID_CREATE_DATA });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'sg-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/service-groups/sg-01', { body: VALID_CREATE_DATA });
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_CREATE_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePost({ data: { data: { id: 'new' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('validate requires priorityMode even when other fields are filled', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupSave(), { wrapper });
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      priorityMode: '',
    }, 'create');
    expect(errors.priorityMode).toBeDefined();
    expect(errors.name).toBeUndefined();
  });
});
