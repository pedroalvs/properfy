import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppTourLoadGuard, useAppTourController, type TourControllerInputs } from '../useAppTourController';
import { TOUR_PENDING_KEY } from '../../lib/tour-pending-storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

const USER = 'user-1';

function baseInputs(over: Partial<TourControllerInputs> = {}): TourControllerInputs {
  return {
    userId: USER,
    onboardingCompletedAt: null,
    inspectorMeLoaded: true,
    isTodayRoute: true,
    planSettled: true,
    replayRequested: false,
    ...over,
  };
}

function setup(inputs: TourControllerInputs, depsOver = {}) {
  const postCompletion = vi.fn(async () => {});
  const invalidateInspectorMe = vi.fn();
  const storage = memoryStorage();
  const deps = {
    storage,
    postCompletion,
    invalidateInspectorMe,
    isOnline: () => true,
    hasOpenOverlay: () => false,
    ...depsOver,
  };
  return { postCompletion, invalidateInspectorMe, storage, deps };
}

beforeEach(() => resetAppTourLoadGuard());
afterEach(() => vi.restoreAllMocks());

describe('useAppTourController', () => {
  it('opens once on first access at /today with the plan settled', () => {
    const { deps } = setup(baseInputs());
    const { result } = renderHook(() => useAppTourController(baseInputs(), deps));
    expect(result.current.open).toBe(true);
  });

  it('does not open off the /today route (deep link), opens once there', () => {
    const { deps } = setup(baseInputs());
    const { result, rerender } = renderHook(
      ({ inputs }) => useAppTourController(inputs, deps),
      { initialProps: { inputs: baseInputs({ isTodayRoute: false }) } },
    );
    expect(result.current.open).toBe(false);
    rerender({ inputs: baseInputs({ isTodayRoute: true }) });
    expect(result.current.open).toBe(true);
  });

  it('waits until the plan is settled', () => {
    const { deps } = setup(baseInputs());
    const { result, rerender } = renderHook(
      ({ inputs }) => useAppTourController(inputs, deps),
      { initialProps: { inputs: baseInputs({ planSettled: false }) } },
    );
    expect(result.current.open).toBe(false);
    rerender({ inputs: baseInputs({ planSettled: true }) });
    expect(result.current.open).toBe(true);
  });

  it('never opens when onboarding is already recorded', () => {
    const { deps } = setup(baseInputs());
    const { result } = renderHook(() =>
      useAppTourController(baseInputs({ onboardingCompletedAt: '2026-10-30T00:00:00.000Z' }), deps),
    );
    expect(result.current.open).toBe(false);
  });

  it('waits while the inspector record is loading', () => {
    const { deps } = setup(baseInputs());
    const { result } = renderHook(() =>
      useAppTourController(baseInputs({ inspectorMeLoaded: false, onboardingCompletedAt: undefined }), deps),
    );
    expect(result.current.open).toBe(false);
  });

  it('does not open while a blocking overlay is open, then opens when it closes', () => {
    let overlayOpen = true;
    const { deps } = setup(baseInputs(), { hasOpenOverlay: () => overlayOpen });
    const { result, rerender } = renderHook(({ inputs }) => useAppTourController(inputs, deps), {
      initialProps: { inputs: baseInputs() },
    });
    expect(result.current.open).toBe(false);
    overlayOpen = false;
    rerender({ inputs: baseInputs({ planSettled: true }) }); // trigger re-eval
    expect(result.current.open).toBe(true);
  });

  it('records completion once on finish and invalidates the profile', async () => {
    const { deps, postCompletion, invalidateInspectorMe, storage } = setup(baseInputs());
    const { result } = renderHook(() => useAppTourController(baseInputs(), deps));
    await act(async () => {
      result.current.onFinish('completed');
    });
    expect(postCompletion).toHaveBeenCalledTimes(1);
    expect(invalidateInspectorMe).toHaveBeenCalledTimes(1);
    expect(storage._map.has(TOUR_PENDING_KEY)).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it('records completion once on skip', async () => {
    const { deps, postCompletion } = setup(baseInputs());
    const { result } = renderHook(() => useAppTourController(baseInputs(), deps));
    await act(async () => {
      result.current.onFinish('skipped');
    });
    expect(postCompletion).toHaveBeenCalledTimes(1);
  });

  it('marks a local pending record and does not reopen when the POST fails', async () => {
    const postCompletion = vi.fn(async () => {
      throw new Error('offline');
    });
    const { deps, storage } = setup(baseInputs(), { postCompletion });
    const { result, rerender } = renderHook(({ inputs }) => useAppTourController(inputs, deps), {
      initialProps: { inputs: baseInputs() },
    });
    await act(async () => {
      result.current.onFinish('completed');
    });
    expect(storage._map.get(TOUR_PENDING_KEY)).toBe(USER);
    // A subsequent re-eval with onboarding still null must not reopen.
    rerender({ inputs: baseInputs() });
    expect(result.current.open).toBe(false);
  });

  it('does not reopen when a pending record exists for this user', () => {
    const { deps } = setup(baseInputs(), { storage: memoryStorage({ [TOUR_PENDING_KEY]: USER }) });
    const { result } = renderHook(() => useAppTourController(baseInputs(), deps));
    expect(result.current.open).toBe(false);
  });

  it('ignores a pending record that belongs to another user', () => {
    const { deps } = setup(baseInputs(), { storage: memoryStorage({ [TOUR_PENDING_KEY]: 'user-2' }) });
    const { result } = renderHook(() => useAppTourController(baseInputs(), deps));
    expect(result.current.open).toBe(true);
  });

  it('opens on replay regardless of onboarding and sends no completion', async () => {
    const { deps, postCompletion } = setup(baseInputs());
    const { result } = renderHook(() =>
      useAppTourController(
        baseInputs({ replayRequested: true, onboardingCompletedAt: '2026-10-30T00:00:00.000Z' }),
        deps,
      ),
    );
    expect(result.current.open).toBe(true);
    await act(async () => {
      result.current.onFinish('completed');
    });
    expect(postCompletion).not.toHaveBeenCalled();
  });

  it('opens at most once per load even if storage throws', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    const { deps } = setup(baseInputs(), { storage: throwingStorage });
    const { result, rerender } = renderHook(({ inputs }) => useAppTourController(inputs, deps), {
      initialProps: { inputs: baseInputs() },
    });
    expect(result.current.open).toBe(true);
    // After finishing, it must not reopen this load.
    act(() => result.current.onFinish('skipped'));
    rerender({ inputs: baseInputs() });
    expect(result.current.open).toBe(false);
  });
});
