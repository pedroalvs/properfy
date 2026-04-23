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
import { useBranchSave } from './useBranchSave';
import type { BranchFormData } from '../types';
import { EMPTY_BRANCH_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_DATA: BranchFormData = {
  name: 'Centro',
  address: {
    formattedAddress: 'Rua Augusta, 100, Sao Paulo SP 01000-000, BR',
    street: 'Rua Augusta, 100',
    suburb: 'Sao Paulo',
    postcode: '01000-000',
    state: 'SP',
    country: 'BR',
    latitude: -23.55,
    longitude: -46.63,
    provider: 'MAPBOX',
  },
  contactEmail: 'centro@imob.com',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-branch' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'br-01' } } });
});

describe('useBranchSave', () => {
  it('validate returns error when name is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });
    const errors = result.current.validate(EMPTY_BRANCH_FORM);
    expect(errors.name).toBeDefined();
  });

  it('validate returns no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validate flags invalid email format', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, contactEmail: 'not-an-email' });
    expect(errors.contactEmail).toBeDefined();
  });

  it('validate does not require address or email', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });
    const errors = result.current.validate({ name: 'Centro', address: null, contactEmail: '' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('save returns success on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'ten-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants/ten-01/branches', {
      body: {
        name: VALID_DATA.name,
        address: {
          street: VALID_DATA.address!.street,
          suburb: VALID_DATA.address!.suburb,
          city: VALID_DATA.address!.suburb,
          state: VALID_DATA.address!.state,
          postcode: VALID_DATA.address!.postcode,
          country: VALID_DATA.address!.country,
          latitude: VALID_DATA.address!.latitude || undefined,
          longitude: VALID_DATA.address!.longitude || undefined,
        },
        contactEmail: VALID_DATA.contactEmail,
      },
    });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'ten-01', 'br-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/ten-01/branches/br-01', {
      body: {
        name: VALID_DATA.name,
        address: {
          street: VALID_DATA.address!.street,
          suburb: VALID_DATA.address!.suburb,
          city: VALID_DATA.address!.suburb,
          state: VALID_DATA.address!.state,
          postcode: VALID_DATA.address!.postcode,
          country: VALID_DATA.address!.country,
          latitude: VALID_DATA.address!.latitude || undefined,
          longitude: VALID_DATA.address!.longitude || undefined,
        },
        contactEmail: VALID_DATA.contactEmail,
      },
    });
  });

  it('save omits address when null', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });
    const noAddress: BranchFormData = { name: 'Filial', address: null, contactEmail: '' };

    await act(async () => {
      await result.current.save(noAddress, 'ten-01');
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/tenants/ten-01/branches', {
      body: { name: 'Filial', address: undefined, contactEmail: undefined },
    });
  });

  it('save returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'ten-01');
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });
});
