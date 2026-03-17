import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { apiClient } from '@/lib/api-client';
import { useUserSave } from './useUserSave';
import type { UserFormData } from '../types';
import { EMPTY_USER_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;

const VALID_CREATE_DATA: UserFormData = {
  name: 'Teste Usuário',
  email: 'teste@properfy.com',
  phone: '11999999999',
  role: 'AM',
  status: '',
  branchId: '',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { id: 'new-usr' } });
  mockPatch.mockResolvedValue({ data: { id: 'usr-01' } });
});

describe('useUserSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });
    const errors = result.current.validate(EMPTY_USER_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.role).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_CREATE_DATA, email: 'not-an-email' }, 'create');
    expect(errors.email).toBe('E-mail inválido');
  });

  it('validate accepts empty optional fields', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      phone: '',
      branchId: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants/tenant-1/users', expect.any(Object));
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'usr-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/tenant-1/users/usr-01', expect.any(Object));
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_CREATE_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePost({ data: { id: 'new' } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
