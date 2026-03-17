import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFinancialEntrySave } from './useFinancialEntrySave';
import type { FinancialEntryFormData } from '../types';
import { EMPTY_FINANCIAL_ENTRY_FORM } from '../types';

const VALID_CREATE_DATA: FinancialEntryFormData = {
  entryType: 'TENANT_DEBIT',
  amount: '350',
  description: 'Test debit',
  relatedEntityName: 'Test Agency',
  effectiveAt: '2026-03-15',
  referenceNumber: '',
  notes: '',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFinancialEntrySave', () => {
  it('validate returns errors for required fields when form is empty (create mode)', () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    const errors = result.current.validate(EMPTY_FINANCIAL_ENTRY_FORM, 'create');
    expect(Object.keys(errors)).toHaveLength(5);
    expect(errors.entryType).toBe('Required field');
    expect(errors.amount).toBe('Required field');
    expect(errors.description).toBe('Required field');
    expect(errors.relatedEntityName).toBe('Required field');
    expect(errors.effectiveAt).toBe('Required field');
  });

  it('validate returns errors for required fields when form is empty (edit mode)', () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    const errors = result.current.validate(EMPTY_FINANCIAL_ENTRY_FORM, 'edit');
    expect(Object.keys(errors)).toHaveLength(4);
    expect(errors.entryType).toBeUndefined();
    expect(errors.amount).toBe('Required field');
    expect(errors.description).toBe('Required field');
    expect(errors.relatedEntityName).toBe('Required field');
    expect(errors.effectiveAt).toBe('Required field');
  });

  it('validate returns no errors for valid create form data', () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate accepts empty optional fields (referenceNumber, notes)', () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(errors.referenceNumber).toBeUndefined();
    expect(errors.notes).toBeUndefined();
  });

  it('save resolves true on success (create mode)', async () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA).then((r) => { resolved = r; });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('save resolves true on success (edit mode)', async () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    let resolved = false;
    act(() => {
      result.current.save(VALID_CREATE_DATA, 'fin-01').then((r) => { resolved = r; });
    });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(resolved).toBe(true);
  });

  it('isSaving is true during save operation', async () => {
    const { result } = renderHook(() => useFinancialEntrySave());
    expect(result.current.isSaving).toBe(false);
    act(() => {
      result.current.save(VALID_CREATE_DATA);
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.isSaving).toBe(false);
  });
});
