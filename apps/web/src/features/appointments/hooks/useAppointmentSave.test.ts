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
import { useAppointmentSave } from './useAppointmentSave';
import type { AppointmentFormData } from '../types';
import { EMPTY_FORM_DATA } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

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
  hasRestriction: false,
  restrictionIsHome: false,
  restrictionNotes: '',
  restrictionTouched: false,
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-apt' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'apt-01' } } });
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
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: {
        branchId: VALID_CREATE_DATA.branchId,
        propertyId: VALID_CREATE_DATA.propertyId,
        serviceTypeId: VALID_CREATE_DATA.serviceTypeId,
        scheduledDate: VALID_CREATE_DATA.scheduledDate,
        timeSlot: VALID_CREATE_DATA.timeSlot,
        keyRequired: VALID_CREATE_DATA.keyRequired,
        contact: {
          tenantName: VALID_CREATE_DATA.contactName,
          primaryEmail: VALID_CREATE_DATA.contactEmail,
          primaryPhone: VALID_CREATE_DATA.contactPhone,
        },
      },
    });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'apt-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', {
      body: {
        scheduledDate: VALID_CREATE_DATA.scheduledDate,
        timeSlot: VALID_CREATE_DATA.timeSlot,
        keyRequired: VALID_CREATE_DATA.keyRequired,
        meetingLocation: null,
        keyLocation: null,
        notes: null,
        contact: {
          tenantName: VALID_CREATE_DATA.contactName,
          primaryEmail: VALID_CREATE_DATA.contactEmail,
          primaryPhone: VALID_CREATE_DATA.contactPhone,
        },
      },
    });
  });

  it('includes restriction payload when set on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    await act(async () => {
      await result.current.save({
        ...VALID_CREATE_DATA,
        hasRestriction: true,
        restrictionIsHome: true,
        restrictionNotes: 'Ring bell',
        restrictionTouched: true,
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: expect.objectContaining({
        restriction: {
          isHome: true,
          notes: 'Ring bell',
          source: 'OPERATOR',
        },
      }),
    });
  });

  it('sends null restriction on edit when restriction was cleared', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    await act(async () => {
      await result.current.save({
        ...VALID_CREATE_DATA,
        hasRestriction: false,
        restrictionTouched: true,
      }, 'apt-01');
    });

    expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', {
      body: expect.objectContaining({
        restriction: null,
      }),
    });
  });

  it('save returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
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
      resolvePost({ data: { data: { id: 'new' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
