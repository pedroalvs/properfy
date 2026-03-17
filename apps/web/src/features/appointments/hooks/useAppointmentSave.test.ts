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

import { apiClient } from '@/lib/api-client';
import { useAppointmentSave } from './useAppointmentSave';
import type { AppointmentFormData } from '../types';
import { EMPTY_FORM_DATA } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;

const VALID_CREATE_DATA: AppointmentFormData = {
  branchId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  propertyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
  serviceTypeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d481',
  scheduledDate: '2026-04-01',
  timeSlot: '09:00-12:00',
  contactName: 'João Silva',
  contactPhone: '11999999999',
  contactEmail: 'joao@email.com',
  keyRequired: false,
  meetingLocation: '',
  keyLocation: '',
  notes: '',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { id: 'new-apt' } });
  mockPatch.mockResolvedValue({ data: { id: 'apt-01' } });
});

describe('useAppointmentSave', () => {
  it('validate returns errors for all required fields when create form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });
    const errors = result.current.validate(EMPTY_FORM_DATA, 'create');
    expect(errors.branchId).toBeDefined();
    expect(errors.propertyId).toBeDefined();
    expect(errors.serviceTypeId).toBeDefined();
    expect(errors.scheduledDate).toBeDefined();
    expect(errors.timeSlot).toBeDefined();
    expect(errors.contactName).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });
    const errors = result.current.validate(
      { ...VALID_CREATE_DATA, contactEmail: 'not-an-email' },
      'create',
    );
    expect(errors.contactEmail).toBeDefined();
  });

  it('validate returns no errors for valid edit form (partial data fine)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });
    const errors = result.current.validate(
      { ...EMPTY_FORM_DATA, contactName: 'Maria', scheduledDate: '2026-04-01', timeSlot: '09:00-12:00' },
      'edit',
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', VALID_CREATE_DATA);
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'apt-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', VALID_CREATE_DATA);
  });

  it('save returns failure on API error', async () => {
    mockPost.mockRejectedValueOnce(new Error('Server error'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

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
