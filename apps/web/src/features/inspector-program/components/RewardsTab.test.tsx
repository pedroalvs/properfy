import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@properfy/shared';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { RewardsTab } from './RewardsTab';

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({ useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn() }) }));

const mockHasRole = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasRole: mockHasRole }) }));

vi.mock('../hooks/useProgramPeriods', () => ({ useProgramPeriods: vi.fn() }));
vi.mock('../hooks/useProgramSummary', () => ({ useProgramSummary: vi.fn() }));
vi.mock('../hooks/useRewardAwards', () => ({ useRewardAwards: vi.fn() }));
vi.mock('../hooks/useRewardAwardAction', () => ({ useRewardAwardAction: vi.fn() }));

import { useProgramPeriods } from '../hooks/useProgramPeriods';
import { useProgramSummary } from '../hooks/useProgramSummary';
import { useRewardAwards } from '../hooks/useRewardAwards';
import { useRewardAwardAction } from '../hooks/useRewardAwardAction';

const mockPeriods = useProgramPeriods as unknown as Mock;
const mockSummary = useProgramSummary as unknown as Mock;
const mockAwards = useRewardAwards as unknown as Mock;
const mockAction = useRewardAwardAction as unknown as Mock;

const CURRENT = [{ start: '2026-11-09', end: '2026-11-15', status: 'IN_PROGRESS' as const }];
const PAST = [
  { start: '2026-11-02', end: '2026-11-08', status: 'CLOSED' as const },
  { start: '2026-10-26', end: '2026-11-01', status: 'CLOSED' as const },
];

const CLOSED_SUMMARY = {
  periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'CLOSED',
  totals: { promised: 90, achieved: 30, approved: 0, paid: 0, pending: 30, voided: 0 },
  goals: [{ goalId: 'g1', title: 'Weekly ten', metric: 'VOLUME', rewardAmount: 30, participants: 3, promised: 90, achievers: 1, achievedAmount: 30, closed: true, skipped: false }],
};
const IN_PROGRESS_SUMMARY = { ...CLOSED_SUMMARY, periodStart: '2026-11-09', status: 'IN_PROGRESS' };

const pendingAward = {
  id: 'a1', goalId: 'g1', inspectorId: 'i1', periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08',
  goalTitle: 'Weekly ten', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
  achievedValue: 62, serviceCount: 62, achievedOn: '2026-11-07', indexScoreAtClose: 88.3, levelAtClose: 'GOLD',
  indexSnapshotDate: '2026-11-08', status: 'PENDING', approvedByUserId: null, approvedByName: null, approvedAt: null,
  paidAt: null, financialEntryId: null, invoice: null, voidedAfterInvoicing: false, voidedByUserId: null, voidedByName: null, voidedAt: null, voidReason: null, inspectorNote: null,
  goal: { id: 'g1', title: 'Weekly ten' }, inspector: { id: 'i1', name: 'Jane Doe', email: 'jane@x.com' },
  createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z',
};

const approve = vi.fn();
const voidAward = vi.fn();

function renderTab(entry = '/goals-rewards?tab=rewards') {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[entry]}>
      <RewardsTab />
    </MemoryRouter>,
    { wrapper: createQueryWrapper() },
  );
}

beforeEach(() => {
  mockHasRole.mockReset().mockReturnValue(false);
  showSuccess.mockReset();
  showError.mockReset();
  // A real action resolves to the award object; `undefined` means the call was
  // collapsed (no request sent) — the caller must not toast success for it.
  approve.mockReset().mockResolvedValue(pendingAward);
  voidAward.mockReset().mockResolvedValue(pendingAward);
  mockPeriods.mockReset().mockImplementation(({ direction }: { direction: string }) => ({
    periods: direction === 'past' ? PAST : CURRENT, isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }));
  mockSummary.mockReset().mockImplementation((_cycle: string, periodStart: string | null) => ({
    summary: periodStart === '2026-11-09' ? IN_PROGRESS_SUMMARY : periodStart ? CLOSED_SUMMARY : null,
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }));
  mockAwards.mockReset().mockReturnValue({ awards: [pendingAward], isLoading: false, isError: false, error: null, refetch: vi.fn() });
  mockAction.mockReset().mockReturnValue({ approve, voidAward, pendingId: null });
});

describe('RewardsTab', () => {
  it('describes the Paid tile as paid through the inspector\'s invoice', () => {
    renderTab();
    expect(screen.getAllByLabelText("Paid through the inspector's invoice.").length).toBeGreaterThan(0);
  });

  it('shows the AM-only message when voiding an invoiced reward returns 403', async () => {
    mockHasRole.mockReturnValue(true);
    const invoiced = { ...pendingAward, status: 'APPROVED', invoice: { id: 'inv-1', invoiceNumberDisplay: 'PINV-000042', status: 'CLOSED' } };
    mockAwards.mockReturnValue({ awards: [invoiced], isLoading: false, isError: false, error: null, refetch: vi.fn() });
    voidAward.mockRejectedValue(new ApiError(403, 'forbidden'));
    renderTab('/goals-rewards?tab=rewards&cycle=WEEKLY&period=2026-11-02');
    await userEvent.click(screen.getByRole('button', { name: 'Void reward for Jane Doe' }));
    expect(screen.getByText(/already on an invoice/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Internal reason'), 'wrong goal');
    await userEvent.click(screen.getByRole('button', { name: 'Void reward' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Only an Admin Master can void an invoiced reward.'));
  });

  it('shows the cycle + period selectors with the current period marked in progress', async () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'Cycle' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Period' }));
    const listbox = screen.getByRole('listbox');
    const { getByText } = within(listbox);
    expect(getByText('Week of Mon 9 Nov 2026 · In progress')).toBeInTheDocument();
  });

  it('defaults to the current in-progress period: tiles + open-period message, no awards table', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Promised')).toBeInTheDocument());
    expect(screen.getByText('This period is still open. Rewards are created after it closes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve reward/ })).not.toBeInTheDocument();
  });

  it('shows awards for a closed period and approves one', async () => {
    renderTab('/goals-rewards?tab=rewards&cycle=WEEKLY&period=2026-11-02');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve reward for Jane Doe' })).toBeInTheDocument());
    expect(screen.queryByText(/Mark as paid/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve reward for Jane Doe' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('a1'));
    expect(showSuccess).toHaveBeenCalledWith('Reward approved');
  });

  it('does not toast success when an approve is collapsed (no request sent)', async () => {
    approve.mockResolvedValue(undefined); // the hook's collapsed-call sentinel
    renderTab('/goals-rewards?tab=rewards&cycle=WEEKLY&period=2026-11-02');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve reward for Jane Doe' }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(showSuccess).not.toHaveBeenCalledWith('Reward approved');
  });

  it('surfaces a 409 on approve as a stale message', async () => {
    approve.mockRejectedValue(new ApiError(409, 'stale'));
    renderTab('/goals-rewards?tab=rewards&cycle=WEEKLY&period=2026-11-02');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve reward for Jane Doe' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('This reward was updated by someone else.'));
  });

  it('voids an award through the dialog', async () => {
    renderTab('/goals-rewards?tab=rewards&cycle=WEEKLY&period=2026-11-02');
    await userEvent.click(await screen.findByRole('button', { name: 'Void reward for Jane Doe' }));
    await userEvent.type(screen.getByLabelText('Internal reason'), 'Agency rejected the job');
    await userEvent.click(screen.getByRole('button', { name: 'Void reward' }));
    await waitFor(() =>
      expect(voidAward).toHaveBeenCalledWith({ awardId: 'a1', reason: 'Agency rejected the job', inspectorNote: undefined }),
    );
    expect(showSuccess).toHaveBeenCalledWith('Reward voided');
  });
});
