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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'AM', tenantId: null }, isAuthenticated: true }),
}));

import { api } from '@/services/api';
import { usePropertySave } from './usePropertySave';
import type { PropertyFormData } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_CREATE_DATA: PropertyFormData = {
  type: 'HOUSE',
  apartmentNumber: '',
  branchId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  street: '123 Smith Street',
  addressLine2: 'Unit 42',
  suburb: 'Melbourne',
  postcode: '3000',
  state: 'VIC',
  country: 'AU',
  privateAreaM2: '',
  totalAreaM2: '',
  furnished: '',
  linenProvided: '',
  rentAmount: '',
  notes: '',
  latitude: '',
  longitude: '',
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-prop' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'prop-01' } } });
});

describe('usePropertySave', () => {
  it('validate returns errors for all required fields when create form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });
    const errors = result.current.validate(EMPTY_PROPERTY_FORM, 'create');
    expect(errors.type).toBeDefined();
    expect(errors.street).toBeDefined();
    expect(errors.suburb).toBeDefined();
    expect(errors.postcode).toBeDefined();
    expect(errors.state).toBeDefined();
  });

  it('validate returns no errors for valid create form data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });
    const errors = result.current.validate(VALID_CREATE_DATA, 'create');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('create payload sends apartmentNumber only for APARTMENT type', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });

    await act(async () => {
      await result.current.save(
        { ...VALID_CREATE_DATA, type: 'APARTMENT', apartmentNumber: ' Apt 12B ' },
        undefined,
        '123e4567-e89b-12d3-a456-426614174000',
      );
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/properties', {
      body: expect.objectContaining({ apartmentNumber: 'Apt 12B' }),
    });

    mockPost.mockClear();
    await act(async () => {
      await result.current.save(
        { ...VALID_CREATE_DATA, type: 'HOUSE', apartmentNumber: 'Apt 12B' },
        undefined,
        '123e4567-e89b-12d3-a456-426614174000',
      );
    });
    const houseBody = mockPost.mock.calls[0]![1].body as Record<string, unknown>;
    expect('apartmentNumber' in houseBody).toBe(false);
  });

  it('edit payload nulls apartmentNumber when type is not APARTMENT', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });

    await act(async () => {
      await result.current.save({ ...VALID_CREATE_DATA, apartmentNumber: 'Apt 9' }, 'prop-01');
    });

    expect(mockPatch).toHaveBeenCalledWith('/v1/properties/prop-01', {
      body: expect.objectContaining({ apartmentNumber: null }),
    });
  });

  it('validate requires address fields in edit mode', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });
    const errors = result.current.validate(EMPTY_PROPERTY_FORM, 'edit');
    expect(errors.street).toBeDefined();
    expect(errors.suburb).toBeDefined();
    expect(errors.postcode).toBeDefined();
    expect(errors.state).toBeDefined();
  });

  it('save returns success and id on create', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });

    let saveResult: { success: boolean; id?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, undefined, '123e4567-e89b-12d3-a456-426614174000');
    });

    expect(saveResult?.success).toBe(true);
    expect(saveResult?.id).toBe('new-prop');
    expect(mockPost).toHaveBeenCalledWith('/v1/properties', {
      body: expect.objectContaining({
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        type: VALID_CREATE_DATA.type,
        branchId: VALID_CREATE_DATA.branchId,
        street: VALID_CREATE_DATA.street,
        suburb: VALID_CREATE_DATA.suburb,
        postcode: VALID_CREATE_DATA.postcode,
        state: VALID_CREATE_DATA.state,
        country: VALID_CREATE_DATA.country,
      }),
    });
  });

  it('save returns success on edit', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_CREATE_DATA, 'prop-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/properties/prop-01', {
      body: expect.objectContaining({
        type: VALID_CREATE_DATA.type,
        branchId: VALID_CREATE_DATA.branchId,
        street: VALID_CREATE_DATA.street,
        suburb: VALID_CREATE_DATA.suburb,
        postcode: VALID_CREATE_DATA.postcode,
        state: VALID_CREATE_DATA.state,
        country: VALID_CREATE_DATA.country,
      }),
    });
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertySave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_CREATE_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePost({ data: { data: { id: 'new' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
