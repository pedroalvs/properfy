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
  currency: 'AUD',
  appointmentCodePrefix: 'INS',
  notes: '',
  emailSendingEnabled: true,
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

  it('validate requires appointmentCodePrefix on create', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, appointmentCodePrefix: '' });
    expect(errors.appointmentCodePrefix).toBeDefined();
  });

  it('validate allows an empty appointmentCodePrefix on edit (legacy tenants)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, appointmentCodePrefix: '' }, { isCreate: false });
    expect(errors.appointmentCodePrefix).toBeUndefined();
  });

  it('validate still rejects a malformed prefix on edit', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, appointmentCodePrefix: 'A' }, { isCreate: false });
    expect(errors.appointmentCodePrefix).toBeDefined();
  });

  it('save omits an empty prefix from the edit payload (legacy tenant unrelated edit)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_DATA, appointmentCodePrefix: '' }, 'ten-01');
    });

    const body = mockPatch.mock.calls[0]![1].body;
    expect(body).not.toHaveProperty('appointmentCodePrefix');
  });

  it('validate rejects a too-short / too-long / non-alphanumeric prefix', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    expect(result.current.validate({ ...VALID_DATA, appointmentCodePrefix: 'AB' }).appointmentCodePrefix).toBeDefined();
    expect(result.current.validate({ ...VALID_DATA, appointmentCodePrefix: 'ABCDE' }).appointmentCodePrefix).toBeDefined();
    expect(result.current.validate({ ...VALID_DATA, appointmentCodePrefix: 'A-1' }).appointmentCodePrefix).toBeDefined();
  });

  it('validate accepts a lowercase prefix (uppercased before checking)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });
    expect(result.current.validate({ ...VALID_DATA, appointmentCodePrefix: 'ab1' }).appointmentCodePrefix).toBeUndefined();
  });

  it('save uppercases the prefix in the payload', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_DATA, appointmentCodePrefix: 'abc' });
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants',
      expect.objectContaining({ body: expect.objectContaining({ appointmentCodePrefix: 'ABC' }) }),
    );
  });

  it('save maps a 409 prefix conflict to an inline field error', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'TENANT_PREFIX_CONFLICT', message: 'already in use' } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.fieldErrors?.appointmentCodePrefix).toBeDefined();
    expect(saveResult?.error).toBeUndefined();
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    // emailSendingEnabled is nested under settings; scalar fields stay top-level.
    // notes is excluded — it is not part of the API contract.
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants', {
      body: {
        name: 'Imob Alpha',
        legalName: 'Alpha LTDA',
        currency: 'AUD',
        appointmentCodePrefix: 'INS',
        settings: { emailSendingEnabled: true },
      },
    });
  });

  it('always sends appointmentCodePrefix in POST body (required by the create contract)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_DATA, appointmentCodePrefix: '' });
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/tenants', {
      body: expect.objectContaining({ appointmentCodePrefix: '' }),
    });
  });

  it('nests emailSendingEnabled under settings when disabled', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_DATA, emailSendingEnabled: false }, 'ten-01');
    });

    expect(mockPatch).toHaveBeenCalledWith(
      '/v1/tenants/{tenantId}',
      expect.objectContaining({
        params: { path: { tenantId: 'ten-01' } },
        body: expect.objectContaining({ settings: { emailSendingEnabled: false } }),
      }),
    );
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'ten-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      '/v1/tenants/{tenantId}',
      expect.objectContaining({
        params: { path: { tenantId: 'ten-01' } },
        body: expect.objectContaining({ settings: { emailSendingEnabled: true } }),
      }),
    );
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
