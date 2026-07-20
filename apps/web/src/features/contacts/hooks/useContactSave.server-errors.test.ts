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
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { tenantId: 'tenant-1' } }),
}));

import { api } from '@/services/api';
import { useContactSave } from './useContactSave';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { EMPTY_CONTACT_FORM, type ContactFormData } from '../types';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

const VALID_FORM: ContactFormData = {
  ...EMPTY_CONTACT_FORM,
  type: 'RENTAL_TENANT',
  displayName: 'Jane Tenant',
  primaryEmail: 'jane@example.com',
};

beforeEach(() => {
  mockPost.mockReset();
});

describe('useContactSave — server field errors', () => {
  it('save maps VALIDATION_ERROR details to inline form field errors', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'primaryEmail', message: 'Invalid email address' }],
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSave(), { wrapper });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_FORM);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.errorCode).toBe('VALIDATION_ERROR');
    expect(saveResult?.fieldErrors?.primaryEmail).toBe('Invalid email address');
    expect(saveResult?.errorMessage).toBeUndefined();
  });

  it('save keeps the summary message for per-row channel details (unmatched paths)', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'additionalChannels.0.value', message: 'Value is required' }],
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSave(), { wrapper });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_FORM);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.fieldErrors).toBeUndefined();
    expect(saveResult?.errorMessage).toBe('Validation failed');
  });
});
