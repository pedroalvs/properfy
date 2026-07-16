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

// Both `createAppointmentSchema` and `updateAppointmentSchema` refine against
// today's date and reject past dates. A hard-coded future literal
// turns into a time bomb once the real clock crosses it. Compute dynamically.
const FUTURE_SCHEDULED_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().split('T')[0]!;
})();

const VALID_CREATE_DATA: AppointmentFormData = {
  branchId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  propertyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
  serviceTypeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d481',
  scheduledDate: FUTURE_SCHEDULED_DATE,
  timeSlotStart: '09:00',
  timeSlotEnd: '12:00',
  contactName: 'João Silva',
  contactPhone: '11999999999',
  contactEmail: 'joao@email.com',
  contacts: [],
  customFields: [],
  appCredentialIds: [],
  keyRequired: false,
  meetingLocation: '',
  keyLocation: '',
  notes: '',
  observation: '',
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
    expect(errors.timeSlotStart).toBeDefined();
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
      { ...EMPTY_FORM_DATA, contactName: 'Maria', scheduledDate: FUTURE_SCHEDULED_DATE, timeSlotStart: '09:00', timeSlotEnd: '12:00' },
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
    // Cycle 6 (commits 23fd1ab + 4801500) added TZ-aware past-date validation
    // and started propagating the browser's resolved timezone in every
    // appointment write so the backend can enforce the rule in the actor's
    // local calendar day. The exact value is environment-dependent — assert
    // its presence and shape, not a fixed string.
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: {
        branchId: VALID_CREATE_DATA.branchId,
        propertyId: VALID_CREATE_DATA.propertyId,
        serviceTypeId: VALID_CREATE_DATA.serviceTypeId,
        scheduledDate: VALID_CREATE_DATA.scheduledDate,
        timeSlotStart: VALID_CREATE_DATA.timeSlotStart,
        timeSlotEnd: VALID_CREATE_DATA.timeSlotEnd,
        keyRequired: VALID_CREATE_DATA.keyRequired,
        contact: {
          rentalTenantName: VALID_CREATE_DATA.contactName,
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
        timeSlotStart: VALID_CREATE_DATA.timeSlotStart,
        timeSlotEnd: VALID_CREATE_DATA.timeSlotEnd,
        keyRequired: VALID_CREATE_DATA.keyRequired,
        meetingLocation: null,
        keyLocation: null,
        notes: null,
        observation: null,
        contact: {
          rentalTenantName: VALID_CREATE_DATA.contactName,
          primaryEmail: VALID_CREATE_DATA.contactEmail,
          primaryPhone: VALID_CREATE_DATA.contactPhone,
        },
        customFields: [],
        appCredentialIds: [],
      },
    });
  });

  it('includes trimmed observation on create when set, omits it when empty', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, observation: '  Gate code 4321  ' });
    });
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: expect.objectContaining({ observation: 'Gate code 4321' }),
    });

    mockPost.mockClear();
    await act(async () => {
      await result.current.save(VALID_CREATE_DATA);
    });
    expect((mockPost.mock.calls[0]![1] as any).body).not.toHaveProperty('observation');
  });

  it('sends observation as null on edit when cleared', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, observation: '' }, 'apt-01');
    });
    expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', {
      body: expect.objectContaining({ observation: null }),
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

  it('uses contactId path when contact has contactId', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    const dataWithContactId: AppointmentFormData = {
      ...VALID_CREATE_DATA,
      contacts: [
        {
          key: 'k-1',
          contactId: 'f47ac10b-58cc-4372-a567-0e02b2c3d499',
          name: 'John Doe',
          email: 'john@test.com',
          phone: '11999999999',
          role: 'RENTAL_TENANT' as any,
          isPrimary: true,
        },
      ],
    };

    await act(async () => {
      await result.current.save(dataWithContactId);
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: expect.objectContaining({
        contacts: [
          {
            contactId: 'f47ac10b-58cc-4372-a567-0e02b2c3d499',
            role: 'RENTAL_TENANT',
            isPrimary: true,
          },
        ],
      }),
    });
  });

  it('uses inline path when contact has no contactId', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    const dataWithInline: AppointmentFormData = {
      ...VALID_CREATE_DATA,
      contacts: [
        {
          key: 'k-1',
          name: 'Jane Doe',
          email: 'jane@test.com',
          phone: '',
          role: 'PROPERTY_MANAGER' as any,
          isPrimary: true,
        },
      ],
    };

    await act(async () => {
      await result.current.save(dataWithInline);
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
      body: expect.objectContaining({
        contacts: [
          {
            inline: {
              type: 'RENTAL_TENANT',
              displayName: 'Jane Doe',
              primaryEmail: 'jane@test.com',
              primaryPhone: null,
            },
            role: 'PROPERTY_MANAGER',
            isPrimary: true,
          },
        ],
      }),
    });
  });

  it('supports mixed contactId and inline contacts', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentSave(), { wrapper });

    const mixedData: AppointmentFormData = {
      ...VALID_CREATE_DATA,
      contacts: [
        {
          key: 'k-1',
          contactId: 'f47ac10b-58cc-4372-a567-0e02b2c3d499',
          name: 'Registry Contact',
          email: 'reg@test.com',
          phone: '',
          role: 'RENTAL_TENANT' as any,
          isPrimary: true,
        },
        {
          key: 'k-2',
          name: 'New Contact',
          email: '',
          phone: '11888888888',
          role: 'HOUSEKEEPER' as any,
          isPrimary: false,
        },
      ],
    };

    await act(async () => {
      await result.current.save(mixedData);
    });

    const call = mockPost.mock.calls[0]!;
    const contacts = (call[1] as any).body.contacts;
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toEqual({ contactId: 'f47ac10b-58cc-4372-a567-0e02b2c3d499', role: 'RENTAL_TENANT', isPrimary: true });
    expect(contacts[1]).toHaveProperty('inline');
    expect(contacts[1].inline.displayName).toBe('New Contact');
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

  describe('customFields', () => {
    const cf = (label: string, value: string) => ({ key: `k-${label}`, label, value });

    it('includes trimmed customFields on create when set, omits when all empty', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });

      await act(async () => {
        await result.current.save({
          ...VALID_CREATE_DATA,
          customFields: [cf('  Gate code  ', '  1234  '), cf('Parking', 'Level 2')],
        });
      });
      expect(mockPost).toHaveBeenCalledWith('/v1/appointments', {
        body: expect.objectContaining({
          customFields: [
            { label: 'Gate code', value: '1234' },
            { label: 'Parking', value: 'Level 2' },
          ],
        }),
      });

      mockPost.mockClear();
      await act(async () => {
        await result.current.save({ ...VALID_CREATE_DATA, customFields: [cf('', ''), cf('  ', '  ')] });
      });
      expect((mockPost.mock.calls[0]![1] as any).body).not.toHaveProperty('customFields');
    });

    it('always sends customFields array on edit (empty array clears)', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });

      await act(async () => {
        await result.current.save({ ...VALID_CREATE_DATA, customFields: [] }, 'apt-01');
      });
      expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', {
        body: expect.objectContaining({ customFields: [] }),
      });

      mockPatch.mockClear();
      await act(async () => {
        await result.current.save({ ...VALID_CREATE_DATA, customFields: [cf('Gate', '1')] }, 'apt-01');
      });
      expect(mockPatch).toHaveBeenCalledWith('/v1/appointments/apt-01', {
        body: expect.objectContaining({ customFields: [{ label: 'Gate', value: '1' }] }),
      });
    });

    it('validate flags a row missing its value', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, customFields: [cf('Gate', '')] },
        'create',
      );
      expect(errors.customFields?.[0]?.value).toBeDefined();
    });

    it('validate flags a row missing its label', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, customFields: [cf('', '1234')] },
        'create',
      );
      expect(errors.customFields?.[0]?.label).toBeDefined();
    });

    it('validate flags a label longer than 50 and a value longer than 500', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, customFields: [cf('a'.repeat(51), 'b'.repeat(501))] },
        'create',
      );
      expect(errors.customFields?.[0]?.label).toBeDefined();
      expect(errors.customFields?.[0]?.value).toBeDefined();
    });

    it('validate ignores fully-empty rows (no error)', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });
      const errors = result.current.validate(
        { ...VALID_CREATE_DATA, customFields: [cf('', '')] },
        'create',
      );
      expect(errors.customFields).toBeUndefined();
    });

    it('validate flags more than 4 custom fields', () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useAppointmentSave(), { wrapper });
      const errors = result.current.validate(
        {
          ...VALID_CREATE_DATA,
          customFields: Array.from({ length: 5 }, (_, i) => cf(`L${i}`, `V${i}`)),
        },
        'create',
      );
      expect(errors.customFields).toBeDefined();
    });
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
