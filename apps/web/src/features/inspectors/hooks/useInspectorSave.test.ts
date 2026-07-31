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
import { useInspectorSave } from './useInspectorSave';
import type { InspectorFormData } from '../types';
import { EMPTY_INSPECTOR_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_PASSWORD = 'Insp@2026x';

const VALID_CREATE_DATA: InspectorFormData = {
  name: 'Teste Inspetor',
  email: 'teste@inspecoes.com',
  password: VALID_PASSWORD,
  confirmPassword: VALID_PASSWORD,
  phone: '11999999999',
  status: '',
  regionIds: [],
  serviceTypes: '123e4567-e89b-12d3-a456-426614174000',
  fullName: '',
  abn: '',
  dateOfBirth: '',
  insuranceFileKey: '',
  insuranceExpiresAt: '',
  policeCheckFileKey: '',
  policeCheckExpiresAt: '',
  blockedClients: [],
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-insp' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'insp-01' } } });
});

describe('useInspectorSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });
    const errors = result.current.validate(EMPTY_INSPECTOR_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_CREATE_DATA, email: 'not-an-email' }, 'create');
    expect(errors.email).toBe('Invalid email');
  });

  it('validate flags invalid service type identifiers', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_CREATE_DATA, serviceTypes: 'vistoria-entrada' }, 'create');
    expect(errors.serviceTypes).toBe('Select valid service types');
  });

  it('validate accepts empty optional fields', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      phone: '',
      serviceTypes: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/inspectors', {
      body: expect.objectContaining({
        serviceTypes: [{ serviceTypeId: '123e4567-e89b-12d3-a456-426614174000', certified: false }],
        password: VALID_PASSWORD,
      }),
    });
  });

  describe('password handling', () => {
    it('validate requires a password on create', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });
      const errors = result.current.validate({ ...VALID_CREATE_DATA, password: '', confirmPassword: '' }, 'create');
      expect(errors.password).toBeDefined();
    });

    it('validate rejects a password below the shared policy', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, password: 'weakpass', confirmPassword: 'weakpass' },
        'create',
      );
      expect(errors.password).toBeDefined();
    });

    it('validate flags a confirmation mismatch', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, confirmPassword: 'Different1!' },
        'create',
      );
      expect(errors.confirmPassword).toBe('Passwords do not match');
    });

    it('validate ignores password fields on edit', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, password: '', confirmPassword: '' },
        'edit',
      );
      expect(errors.password).toBeUndefined();
      expect(errors.confirmPassword).toBeUndefined();
    });

    it('never sends a password on edit', async () => {
      // updateInspectorSchema would strip it silently, so a leaked password
      // would travel in plaintext with nothing to signal the mistake.
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });

      await act(async () => {
        await result.current.save(VALID_CREATE_DATA, 'insp-01');
      });

      expect(mockPatch).toHaveBeenCalledTimes(1);
      const body = mockPatch.mock.calls[0]?.[1]?.body;
      expect(body).toBeDefined();
      expect(body).not.toHaveProperty('password');
      expect(body).not.toHaveProperty('confirmPassword');
    });

    it('never sends confirmPassword on create — it is a UI-only field', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useInspectorSave(), { wrapper });

      await act(async () => {
        await result.current.save(VALID_CREATE_DATA);
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      const body = mockPost.mock.calls[0]?.[1]?.body;
      expect(body).toBeDefined();
      expect(body).not.toHaveProperty('confirmPassword');
    });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'insp-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/inspectors/insp-01', { body: expect.any(Object) });
  });

  it('save returns errorCode on 409 conflict', async () => {
    mockPost.mockResolvedValueOnce({
      error: { error: { code: 'INSPECTOR_EMAIL_CONFLICT', message: 'An inspector with this email already exists' } },
    });

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });

    let saveResult: { success: boolean; error?: string; errorCode?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.errorCode).toBe('INSPECTOR_EMAIL_CONFLICT');
    expect(saveResult?.error).toBe('An inspector with this email already exists');
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorSave(), { wrapper });

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
});
