import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInspectorSave } from './useInspectorSave';
import type { InspectorFormData } from '../types';
import { EMPTY_INSPECTOR_FORM } from '../types';

const VALID_CREATE_DATA: InspectorFormData = {
  name: 'Teste Inspetor',
  email: 'teste@inspecoes.com',
  phone: '11999999999',
  document: '123.456.789-00',
  status: '',
  regions: 'Zona Norte, Zona Sul',
  serviceTypes: 'Vistoria de Entrada',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInspectorSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const { result } = renderHook(() => useInspectorSave());
    const errors = result.current.validate(EMPTY_INSPECTOR_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => useInspectorSave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const { result } = renderHook(() => useInspectorSave());
    const errors = result.current.validate({ ...VALID_CREATE_DATA, email: 'not-an-email' }, 'create');
    expect(errors.email).toBe('E-mail inválido');
  });

  it('validate accepts empty optional fields', () => {
    const { result } = renderHook(() => useInspectorSave());
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      phone: '',
      document: '',
      regions: '',
      serviceTypes: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => useInspectorSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => useInspectorSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'insp-01').then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => useInspectorSave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });
});
