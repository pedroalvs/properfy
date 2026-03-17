import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppointmentSave } from './useAppointmentSave';
import type { AppointmentFormData } from '../types';
import { EMPTY_FORM_DATA } from '../types';

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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppointmentSave', () => {
  it('validate returns errors for all required fields when create form is empty', () => {
    const { result } = renderHook(() => useAppointmentSave());
    const errors = result.current.validate(EMPTY_FORM_DATA, 'create');
    expect(errors.branchId).toBeDefined();
    expect(errors.propertyId).toBeDefined();
    expect(errors.serviceTypeId).toBeDefined();
    expect(errors.scheduledDate).toBeDefined();
    expect(errors.timeSlot).toBeDefined();
    expect(errors.contactName).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => useAppointmentSave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const { result } = renderHook(() => useAppointmentSave());
    const errors = result.current.validate(
      { ...VALID_CREATE_DATA, contactEmail: 'not-an-email' },
      'create',
    );
    expect(errors.contactEmail).toBeDefined();
  });

  it('validate returns no errors for valid edit form (partial data fine)', () => {
    const { result } = renderHook(() => useAppointmentSave());
    const errors = result.current.validate(
      { ...EMPTY_FORM_DATA, contactName: 'Maria', scheduledDate: '2026-04-01', timeSlot: '09:00-12:00' },
      'edit',
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => useAppointmentSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => useAppointmentSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'apt-01').then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => useAppointmentSave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });
});
