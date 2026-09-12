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

import { api } from '@/services/api';
import { useUserSave } from './useUserSave';
import type { UserFormData } from '../types';
import { EMPTY_USER_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_CREATE_DATA: UserFormData = {
  name: 'Teste Usuário',
  email: 'teste@properfy.me',
  phone: '11999999999',
  role: 'CL_USER',
  status: '',
  branchId: '',
  timezone: '',
  password: 'Test@1234',
  confirmPassword: 'Test@1234',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-usr' } }, response: { status: 201 } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'usr-01' } }, response: { status: 200 } });
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
    expect(errors.email).toBe('Invalid email');
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
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants/{tenantId}/users', {
      params: { path: { tenantId: 'tenant-1' } },
      body: expect.any(Object),
    });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'usr-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/{tenantId}/users/{userId}', {
      params: { path: { tenantId: 'tenant-1', userId: 'usr-01' } },
      body: expect.any(Object),
    });
  });

  it('sends the concrete PATCH body and never includes status (edit has no status field)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, status: 'INACTIVE', branchId: 'branch-1' }, 'usr-01');
    });

    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/{tenantId}/users/{userId}', {
      params: { path: { tenantId: 'tenant-1', userId: 'usr-01' } },
      body: {
        name: VALID_CREATE_DATA.name,
        phone: VALID_CREATE_DATA.phone,
        role: VALID_CREATE_DATA.role,
        branchId: 'branch-1',
      },
    });
    expect(mockPatch.mock.calls[0]![1].body).not.toHaveProperty('status');
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
      resolvePost({ data: { data: { id: 'new' } }, response: { status: 201 } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('uses global users endpoint for internal scope', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(undefined, 'internal'), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save({ ...VALID_CREATE_DATA, role: 'OP' });
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/users', { body: expect.any(Object) });
  });

  it('sends the required status envelope back through toApiError on failure', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Email already in use' } },
      response: { status: 409 },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Email already in use');
  });

  it('sends the personal timezone on internal-scope create and omits it when unset', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(undefined, 'internal'), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, role: 'OP', timezone: 'Australia/Perth' });
    });
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({ timezone: 'Australia/Perth' });

    mockPost.mockClear();
    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, role: 'OP' });
    });
    expect(mockPost.mock.calls[0]![1].body).not.toHaveProperty('timezone');
  });

  it('sends timezone null when cleared on internal-scope edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(undefined, 'internal'), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, role: 'OP', timezone: '' }, 'usr-01');
    });

    expect(mockPatch).toHaveBeenCalledWith('/v1/users/{userId}', {
      params: { path: { userId: 'usr-01' } },
      body: expect.objectContaining({ timezone: null }),
    });
  });

  it('never sends timezone for tenant-scope users', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, timezone: 'Australia/Perth' }, 'usr-01');
    });

    expect(mockPatch.mock.calls[0]![1].body).not.toHaveProperty('timezone');
  });
});
