import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePropertySave } from './usePropertySave';
import type { PropertyFormData } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';

const VALID_CREATE_DATA: PropertyFormData = {
  propertyCode: 'IMV-100',
  type: 'RESIDENTIAL',
  branchId: 'branch-1',
  street: 'Rua das Flores, 123',
  addressLine2: 'Apto 42',
  suburb: 'Centro',
  postcode: '01001-000',
  state: 'SP',
  country: 'BR',
  notes: '',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePropertySave', () => {
  it('validate returns errors for all required fields when create form is empty', () => {
    const { result } = renderHook(() => usePropertySave());
    const errors = result.current.validate(EMPTY_PROPERTY_FORM, 'create');
    expect(errors.propertyCode).toBeDefined();
    expect(errors.type).toBeDefined();
    expect(errors.street).toBeDefined();
    expect(errors.suburb).toBeDefined();
    expect(errors.postcode).toBeDefined();
    expect(errors.state).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => usePropertySave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate does not require propertyCode in edit mode', () => {
    const { result } = renderHook(() => usePropertySave());
    const errors = result.current.validate(
      { ...VALID_CREATE_DATA, propertyCode: '' },
      'edit',
    );
    expect(errors.propertyCode).toBeUndefined();
  });

  it('validate requires address fields in edit mode', () => {
    const { result } = renderHook(() => usePropertySave());
    const errors = result.current.validate(EMPTY_PROPERTY_FORM, 'edit');
    expect(errors.street).toBeDefined();
    expect(errors.suburb).toBeDefined();
    expect(errors.postcode).toBeDefined();
    expect(errors.state).toBeDefined();
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => usePropertySave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => usePropertySave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'prop-01').then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => usePropertySave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });
});
