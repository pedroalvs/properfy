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
import { useFinancialEntrySave } from './useFinancialEntrySave';
import type { FinancialEntryFormData } from '../types';
import { EMPTY_FINANCIAL_ENTRY_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_EDIT_DATA: FinancialEntryFormData = {
  entryType: 'TENANT_DEBIT',
  amount: '350',
  description: 'Test debit',
  relatedEntityName: 'Test Agency',
  effectiveAt: '2026-03-15',
  referenceNumber: '',
  notes: '',
};

const ENTRY_ID = 'fin-01';

beforeEach(() => {
  mockPatch.mockReset();
  mockPatch.mockResolvedValue({ data: { data: { id: ENTRY_ID } } });
});

describe('useFinancialEntrySave (edit-only)', () => {
  it('validate returns errors for the required edit fields when the form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(EMPTY_FINANCIAL_ENTRY_FORM);
    expect(Object.keys(errors)).toHaveLength(4);
    expect(errors.entryType).toBeUndefined();
    expect(errors.amount).toBe('Required field');
    expect(errors.description).toBe('Required field');
    expect(errors.relatedEntityName).toBe('Required field');
    expect(errors.effectiveAt).toBe('Required field');
  });

  it('validate returns no errors for valid edit form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(VALID_EDIT_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate accepts empty optional fields (referenceNumber, notes)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(VALID_EDIT_DATA);
    expect(errors.referenceNumber).toBeUndefined();
    expect(errors.notes).toBeUndefined();
  });

  it('save PATCHes the entry and returns success', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_EDIT_DATA, ENTRY_ID);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/financial/entries/{entryId}', {
      params: { path: { entryId: ENTRY_ID } },
      body: expect.any(Object),
    });
  });

  it('save resolves { success: false, error } with the mapped message on a failed request (#681)', async () => {
    mockPatch.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Amount exceeds limit' } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_EDIT_DATA, ENTRY_ID);
    });

    expect(saveResult).toEqual({ success: false, error: 'Amount exceeds limit' });
  });

  it('the in-flight guard makes a second concurrent save a no-op while the first is pending (#681)', async () => {
    let resolvePatch!: (value: unknown) => void;
    mockPatch.mockReturnValueOnce(new Promise((resolve) => { resolvePatch = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    let firstSave!: Promise<{ success: boolean }>;
    let secondSave!: Promise<{ success: boolean; error?: string }>;
    act(() => {
      firstSave = result.current.save(VALID_EDIT_DATA, ENTRY_ID);
      secondSave = result.current.save(VALID_EDIT_DATA, ENTRY_ID);
    });

    const secondResult = await secondSave;
    expect(secondResult.success).toBe(false);

    await act(async () => {
      resolvePatch({ data: { data: { id: ENTRY_ID } } });
      await firstSave;
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
  });

  it('isSaving is true during save operation', async () => {
    let resolvePatch!: (value: unknown) => void;
    mockPatch.mockReturnValueOnce(new Promise((resolve) => { resolvePatch = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_EDIT_DATA, ENTRY_ID);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePatch({ data: { data: { id: ENTRY_ID } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
