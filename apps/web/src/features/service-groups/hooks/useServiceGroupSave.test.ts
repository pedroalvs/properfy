import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServiceGroupSave } from './useServiceGroupSave';
import type { ServiceGroupFormData } from '../types';
import { EMPTY_SERVICE_GROUP_FORM } from '../types';

const VALID_CREATE_DATA: ServiceGroupFormData = {
  name: 'Teste Grupo',
  regionName: 'São Paulo - Centro',
  priorityMode: 'STANDARD',
  description: 'Descrição de teste',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useServiceGroupSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const { result } = renderHook(() => useServiceGroupSave());
    const errors = result.current.validate(EMPTY_SERVICE_GROUP_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.priorityMode).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => useServiceGroupSave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate accepts empty optional fields (regionName, description)', () => {
    const { result } = renderHook(() => useServiceGroupSave());
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      regionName: '',
      description: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => useServiceGroupSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => useServiceGroupSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'sg-01').then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => useServiceGroupSave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });

  it('validate requires priorityMode even when other fields are filled', () => {
    const { result } = renderHook(() => useServiceGroupSave());
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      priorityMode: '',
    }, 'create');
    expect(errors.priorityMode).toBeDefined();
    expect(errors.name).toBeUndefined();
  });
});
