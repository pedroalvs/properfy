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
import { useFinancialEntrySave } from './useFinancialEntrySave';
import type { FinancialEntryFormData } from '../types';
import { EMPTY_FINANCIAL_ENTRY_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;

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
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { id: 'new-fin' } });
  mockPatch.mockResolvedValue({ data: { id: 'fin-01' } });
});

describe('useFinancialEntrySave', () => {
  it('validate returns errors for required fields when form is empty (create mode)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(EMPTY_FINANCIAL_ENTRY_FORM, 'create');
    expect(Object.keys(errors)).toHaveLength(5);
    expect(errors.entryType).toBe('Required field');
    expect(errors.amount).toBe('Required field');
    expect(errors.description).toBe('Required field');
    expect(errors.relatedEntityName).toBe('Required field');
    expect(errors.effectiveAt).toBe('Required field');
  });

  it('validate returns errors for required fields when form is empty (edit mode)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(EMPTY_FINANCIAL_ENTRY_FORM, 'edit');
    expect(Object.keys(errors)).toHaveLength(4);
    expect(errors.entryType).toBeUndefined();
    expect(errors.amount).toBe('Required field');
    expect(errors.description).toBe('Required field');
    expect(errors.relatedEntityName).toBe('Required field');
    expect(errors.effectiveAt).toBe('Required field');
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate accepts empty optional fields (referenceNumber, notes)', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(errors.referenceNumber).toBeUndefined();
    expect(errors.notes).toBeUndefined();
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/financial/entries/adjust', expect.any(Object));
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'fin-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/financial/entries/fin-01', expect.any(Object));
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntrySave(), { wrapper });

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
