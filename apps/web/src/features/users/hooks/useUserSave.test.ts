import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserSave } from './useUserSave';
import type { UserFormData } from '../types';
import { EMPTY_USER_FORM } from '../types';

const VALID_CREATE_DATA: UserFormData = {
  name: 'Teste Usuário',
  email: 'teste@properfy.com',
  phone: '11999999999',
  role: 'AM',
  status: '',
  branchId: '',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUserSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const { result } = renderHook(() => useUserSave());
    const errors = result.current.validate(EMPTY_USER_FORM, 'create');
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.role).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => useUserSave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const { result } = renderHook(() => useUserSave());
    const errors = result.current.validate({ ...VALID_CREATE_DATA, email: 'not-an-email' }, 'create');
    expect(errors.email).toBe('E-mail inválido');
  });

  it('validate accepts empty optional fields', () => {
    const { result } = renderHook(() => useUserSave());
    const errors = result.current.validate({
      ...VALID_CREATE_DATA,
      phone: '',
      branchId: '',
    }, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => useUserSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => useUserSave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'usr-01').then((res) => { resolved = true; expect(res).toBe(true); });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => useUserSave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });
});
