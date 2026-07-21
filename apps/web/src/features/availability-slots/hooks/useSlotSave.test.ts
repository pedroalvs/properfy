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
import { useSlotSave } from './useSlotSave';
import type { SlotFormData } from '../types';
import { DEFAULT_SLOT_FORM } from '../types';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

const VALID_DATA: SlotFormData = {
  inspectorId: 'insp-01',
  date: '2026-03-20',
  startTime: '08:00',
  endTime: '17:00',
  region: 'North Zone',
  capacity: 3,
};

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-slot' } } });
  mockPatch.mockResolvedValue({ data: { data: { id: 'slot-01' } } });
});

describe('useSlotSave', () => {
  it('calls POST for new slot', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/availability-slots', { body: VALID_DATA });
  });

  it('calls PATCH for existing slot', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });

    let saveResult: { success: boolean } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA, 'slot-01');
    });

    expect(saveResult?.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('/v1/availability-slots/slot-01', { body: VALID_DATA });
  });

  it('returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Server error' } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });

    let saveResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      saveResult = await result.current.save(VALID_DATA);
    });

    expect(saveResult?.success).toBe(false);
    expect(saveResult?.error).toBe('Server error');
  });

  it('validates required fields when form is empty', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });
    const errors = result.current.validate(DEFAULT_SLOT_FORM);

    expect(errors.inspectorId).toBeDefined();
    expect(errors.date).toBeDefined();
    expect(errors.region).toBeDefined();
  });

  it('validates no errors for valid data', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });
    const errors = result.current.validate(VALID_DATA);

    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('validates end time must be after start time', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, startTime: '17:00', endTime: '08:00' });

    expect(errors.endTime).toBe('End time must be after start time');
  });

  it('validates capacity must be at least 1', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });
    const errors = result.current.validate({ ...VALID_DATA, capacity: 0 });

    expect(errors.capacity).toBe('Capacity must be at least 1');
  });

  it('isSaving is true during save operation', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotSave(), { wrapper });

    expect(result.current.isSaving).toBe(false);

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save(VALID_DATA);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolvePost({ data: { data: { id: 'new' } } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
