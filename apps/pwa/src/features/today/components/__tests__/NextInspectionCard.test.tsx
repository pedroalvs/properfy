import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { NextInspectionCard } from '../NextInspectionCard';
import { buildStop, STOP_IDS } from '@/features/day-plan/__fixtures__/day-plan';
import { getExecutionState } from '@/features/execution/lib/indexeddb';
import type { ExecutionState } from '@/features/execution/types';

// Mock only the IndexedDB layer so the real useExecutionActions /
// useLocalExecutionState run and the action bar derives its phase from the
// per-appointment local state, exactly as in the app. The failing path is the
// Today screen reusing the single Next card in place as the plan advances.
vi.mock('@/features/execution/lib/indexeddb', () => ({
  getExecutionState: vi.fn(),
  saveExecutionState: vi.fn().mockResolvedValue(undefined),
  clearExecutionState: vi.fn().mockResolvedValue(undefined),
  enqueueAction: vi.fn().mockResolvedValue(undefined),
  getAllQueuedActions: vi.fn().mockResolvedValue([]),
  removeQueuedAction: vi.fn().mockResolvedValue(undefined),
  updateQueuedAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => true }));
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

// The field-event sheets have their own tests; stub them so this stays on the bar.
vi.mock('@/features/field-events/components/CantDoSheet', () => ({ CantDoSheet: () => null }));
vi.mock('@/features/field-events/components/LateNoticeSheet', () => ({ LateNoticeSheet: () => null }));

const mockGet = vi.mocked(getExecutionState);

const PLAN_DATE = '2026-11-05';

function doneState(appointmentId: string): ExecutionState {
  return {
    appointmentId,
    phase: 'DONE',
    pendingSync: false,
    startLocation: null,
    finishLocation: null,
    startedAt: null,
    errorMessage: null,
    lastSavedAt: '2026-11-05T00:00:00.000Z',
  };
}

describe('NextInspectionCard — advancing to the next stop in place', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows Check in for the next stop after the current one is checked out, without remounting', async () => {
    const stopA = buildStop({ appointmentId: STOP_IDS.A, sequence: 1, appointmentCode: 'INS-0042' });
    const stopB = buildStop({ appointmentId: STOP_IDS.B, sequence: 2, appointmentCode: 'INS-0043' });

    // The just-finished stop (A) carries a DONE local row; the next stop (B) has none.
    mockGet.mockImplementation((id: string) =>
      Promise.resolve(id === STOP_IDS.A ? doneState(STOP_IDS.A) : undefined),
    );

    const { rerender } = renderWithProviders(
      <NextInspectionCard stop={stopA} planDate={PLAN_DATE} isToday />,
    );

    // A is DONE: the bar shows no primary button. Let the restore resolve first.
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(STOP_IDS.A));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('card-primary-action')).toBeNull();

    // The day plan refetches after check-out and the next stop becomes B. The card
    // is reused in place (no remount), so the bar must reflect B's own fresh state.
    rerender(<NextInspectionCard stop={stopB} planDate={PLAN_DATE} isToday />);

    const primary = await screen.findByTestId('card-primary-action');
    expect(primary).toHaveTextContent('Check in');
    expect(primary).toBeEnabled();
  });
});
