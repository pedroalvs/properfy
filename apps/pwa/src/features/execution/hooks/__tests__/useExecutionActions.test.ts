import { renderHook, act, waitFor } from '@testing-library/react';
import { ApiError } from '@properfy/shared';
import { useExecutionActions } from '../useExecutionActions';
import type { CapturedLocation, ExecutionState } from '../../types';

const mockStartMutateAsync = vi.fn();
const mockFinishMutateAsync = vi.fn();
const mockUpdateState = vi.fn();
const mockClearState = vi.fn();
let mockState: ExecutionState;

vi.mock('../useLocalExecutionState', () => ({
  useLocalExecutionState: () => ({
    state: mockState,
    updateState: mockUpdateState,
    clearState: mockClearState,
    isRestored: true,
  }),
}));
vi.mock('../useStartInspection', () => ({
  useStartInspection: () => ({ mutateAsync: mockStartMutateAsync, isPending: false }),
}));
vi.mock('../useFinishInspection', () => ({
  useFinishInspection: () => ({ mutateAsync: mockFinishMutateAsync, isPending: false }),
}));

const location: CapturedLocation = {
  latitude: -33.8688,
  longitude: 151.2093,
  accuracy: 10,
  capturedAt: '2026-11-03T09:41:00.000+11:00',
};

function baseState(phase: ExecutionState['phase']): ExecutionState {
  return {
    appointmentId: 'apt-1',
    phase,
    pendingSync: false,
    startLocation: null,
    finishLocation: null,
    startedAt: null,
    errorMessage: null,
    lastSavedAt: null,
  };
}

describe('useExecutionActions', () => {
  beforeEach(() => {
    mockStartMutateAsync.mockReset();
    mockFinishMutateAsync.mockReset();
    mockUpdateState.mockReset();
    mockClearState.mockReset();
    mockState = baseState('PRE_START');
  });

  it('checkIn starts the inspection, writes IN_PROGRESS and returns the server response', async () => {
    mockStartMutateAsync.mockResolvedValue({
      data: { outOfRadius: true, geofence: { mode: 'FLAG', radiusMeters: 300 }, geolocationDistanceMeters: 640 },
    });

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    let response: unknown;
    await act(async () => {
      response = await result.current.checkIn(location);
    });

    expect(mockStartMutateAsync).toHaveBeenCalledWith({ appointmentId: 'apt-1', location });
    expect(mockUpdateState).toHaveBeenCalledWith({
      phase: 'IN_PROGRESS',
      startLocation: location,
      startedAt: location.capturedAt,
    });
    expect(response).toMatchObject({ outOfRadius: true, geolocationDistanceMeters: 640 });
  });

  it('does not write local state when check-in is rejected (422 geofence) and rethrows', async () => {
    const err = new ApiError(422, 'You are 640 m from the property.', 'GEOFENCE_OUT_OF_RADIUS');
    mockStartMutateAsync.mockRejectedValue(err);

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    await expect(
      act(async () => {
        await result.current.checkIn(location);
      }),
    ).rejects.toBe(err);

    expect(mockUpdateState).not.toHaveBeenCalled();
  });

  it('requestCheckOut with an app link asks for SYNC, then finishes on confirm', async () => {
    mockState = baseState('IN_PROGRESS');
    mockFinishMutateAsync.mockResolvedValue({ queued: false });

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    act(() => {
      result.current.requestCheckOut(location, { hasInspectionAppLink: true, isPastScheduledEnd: false });
    });
    expect(result.current.confirmStep).toBe('SYNC');
    expect(mockFinishMutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      result.current.confirmSync();
    });

    expect(result.current.confirmStep).toBeNull();
    expect(mockFinishMutateAsync).toHaveBeenCalledWith({ appointmentId: 'apt-1', location });
    await waitFor(() =>
      expect(mockUpdateState).toHaveBeenCalledWith({ phase: 'DONE', pendingSync: false, errorMessage: null }),
    );
  });

  it('requestCheckOut past the window (no link) asks for PAST_TIME, then finishes on confirm', async () => {
    mockState = baseState('IN_PROGRESS');
    mockFinishMutateAsync.mockResolvedValue({ queued: true });

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    act(() => {
      result.current.requestCheckOut(location, { hasInspectionAppLink: false, isPastScheduledEnd: true });
    });
    expect(result.current.confirmStep).toBe('PAST_TIME');

    await act(async () => {
      result.current.confirmPastTime();
    });

    expect(mockFinishMutateAsync).toHaveBeenCalledWith({ appointmentId: 'apt-1', location });
    await waitFor(() =>
      expect(mockUpdateState).toHaveBeenCalledWith({ phase: 'DONE', pendingSync: true, errorMessage: null }),
    );
  });

  it('requestCheckOut with no link and within the window finishes directly', async () => {
    mockState = baseState('IN_PROGRESS');
    mockFinishMutateAsync.mockResolvedValue({ queued: false });

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    await act(async () => {
      result.current.requestCheckOut(location, { hasInspectionAppLink: false, isPastScheduledEnd: false });
    });

    expect(result.current.confirmStep).toBeNull();
    expect(mockFinishMutateAsync).toHaveBeenCalledWith({ appointmentId: 'apt-1', location });
    await waitFor(() =>
      expect(mockUpdateState).toHaveBeenCalledWith({ phase: 'DONE', pendingSync: false, errorMessage: null }),
    );
  });

  it('moves to ERROR with the message when finish fails', async () => {
    mockState = baseState('IN_PROGRESS');
    mockFinishMutateAsync.mockRejectedValue(new ApiError(500, 'Submission failed', 'INTERNAL'));

    const { result } = renderHook(() => useExecutionActions('apt-1'));

    await act(async () => {
      result.current.requestCheckOut(location, { hasInspectionAppLink: false, isPastScheduledEnd: false });
    });

    await waitFor(() =>
      expect(mockUpdateState).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'ERROR', errorMessage: 'Submission failed' }),
      ),
    );
  });

  it('cancelConfirm clears the pending confirmation without finishing', () => {
    mockState = baseState('IN_PROGRESS');
    const { result } = renderHook(() => useExecutionActions('apt-1'));

    act(() => {
      result.current.requestCheckOut(location, { hasInspectionAppLink: true, isPastScheduledEnd: false });
    });
    expect(result.current.confirmStep).toBe('SYNC');

    act(() => {
      result.current.cancelConfirm();
    });

    expect(result.current.confirmStep).toBeNull();
    expect(mockFinishMutateAsync).not.toHaveBeenCalled();
  });
});
