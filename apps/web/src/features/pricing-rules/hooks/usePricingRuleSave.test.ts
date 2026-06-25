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
import { usePricingRuleSave } from './usePricingRuleSave';
import type { PricingRuleFormData } from '../types';
import { EMPTY_PRICING_RULE_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_DATA: PricingRuleFormData = {
  tenantId: 'ten-1',
  serviceTypeId: 'st-1',
  branchId: '',
  priceAmount: '150.00',
  payoutType: 'FIXED',
  payoutValue: '100.00',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-pr' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'pr-01' } } });
});

describe('usePricingRuleSave', () => {
  it('validate returns errors for required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });
    const errors = result.current.validate(EMPTY_PRICING_RULE_FORM);
    expect(errors.serviceTypeId).toBeDefined();
    expect(errors.priceAmount).toBeDefined();
    expect(errors.payoutType).toBeDefined();
    expect(errors.payoutValue).toBeDefined();
  });

  it('validate returns no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate rejects negative priceAmount', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, priceAmount: '-10' });
    expect(errors.priceAmount).toBeDefined();
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'pr-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalled();
  });

  it('save returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });
});
