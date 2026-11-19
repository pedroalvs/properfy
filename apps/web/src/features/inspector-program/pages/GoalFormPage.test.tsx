import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type { GoalResponse } from '@properfy/shared';
import { GoalFormPage } from './GoalFormPage';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
const mockParams: { goalId?: string } = {};
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof ReactRouterDom>()),
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

const showSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError: vi.fn(), showInfo: vi.fn() }),
}));

vi.mock('@/features/platform-settings/components/InspectorSelect', () => ({
  InspectorSelect: ({ value, onChange, 'aria-label': ariaLabel }: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <input aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../hooks/useGoal', () => ({ useGoal: vi.fn() }));
vi.mock('../hooks/useSaveGoal', () => ({ useSaveGoal: vi.fn() }));
vi.mock('../hooks/useGoals', () => ({ useGoals: vi.fn() }));
vi.mock('../hooks/useProgramPeriods', () => ({ useProgramPeriods: vi.fn() }));
vi.mock('../hooks/useGoalScopeOptions', () => ({ useGoalScopeOptions: vi.fn() }));

import { useGoal } from '../hooks/useGoal';
import { useSaveGoal } from '../hooks/useSaveGoal';
import { useGoals } from '../hooks/useGoals';
import { useProgramPeriods } from '../hooks/useProgramPeriods';
import { useGoalScopeOptions } from '../hooks/useGoalScopeOptions';

const mockUseGoal = useGoal as unknown as Mock;
const mockUseSaveGoal = useSaveGoal as unknown as Mock;
const mockUseGoals = useGoals as unknown as Mock;
const mockUseProgramPeriods = useProgramPeriods as unknown as Mock;
const mockUseScope = useGoalScopeOptions as unknown as Mock;

const createGoal = vi.fn();
const updateGoal = vi.fn();

const STARTS = [
  { start: '2026-11-09', end: '2026-11-15', status: 'UPCOMING' as const },
  { start: '2026-11-16', end: '2026-11-22', status: 'UPCOMING' as const },
];
const ENDS = [
  { start: '2026-11-09', end: '2026-11-15', status: 'UPCOMING' as const },
  { start: '2026-11-16', end: '2026-11-22', status: 'UPCOMING' as const },
  { start: '2026-11-23', end: '2026-11-29', status: 'UPCOMING' as const },
];

function goal(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'g1', title: 'Weekly ten', metric: 'VOLUME', comparator: 'GTE', target: 10, period: 'WEEKLY',
    scopeRegionId: null, scopeServiceTypeId: null, scopeInspectorId: null,
    scopeRegionName: null, scopeServiceTypeName: null, scopeInspectorName: null,
    rewardAmount: 30, startsAt: '2026-11-02', endsAt: null, active: true, deactivatedAt: null,
    pendingChange: null, resumesOn: null, minEndsAt: '2026-11-15',
    currentPeriod: { start: '2026-11-02', end: '2026-11-08' }, lastClosedPeriod: null,
    scopeRegionDeleted: false, createdByUserId: 'u1', updatedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...overrides,
  };
}

function setGoal(g: GoalResponse | null, extra: Record<string, unknown> = {}) {
  mockUseGoal.mockReturnValue({ goal: g, isLoading: false, isError: false, isNotFound: false, error: null, refetch: vi.fn(), ...extra });
}

function renderForm() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GoalFormPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  showSuccess.mockReset();
  createGoal.mockReset().mockResolvedValue({ id: 'g1' });
  updateGoal.mockReset().mockResolvedValue({ id: 'g1' });
  delete mockParams.goalId;
  mockUseGoal.mockReset();
  setGoal(null);
  mockUseSaveGoal.mockReturnValue({ createGoal, updateGoal, isSaving: false });
  mockUseGoals.mockReturnValue({ goals: [], meta: null, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  mockUseProgramPeriods.mockReset().mockImplementation(({ count }: { count: number }) => ({
    periods: count === 13 ? STARTS : ENDS, isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }));
  mockUseScope.mockReturnValue({
    regionOptions: [{ value: 'r1', label: 'Sydney North' }],
    serviceTypeOptions: [{ value: 's1', label: 'Routine' }],
    isLoading: false,
  });
});

async function pickOption(selectLabel: string, optionName: string) {
  await userEvent.click(screen.getByRole('button', { name: selectLabel }));
  await userEvent.click(screen.getByRole('option', { name: optionName }));
}

describe('GoalFormPage — create', () => {
  it('shows metric-dependent scope fields and target unit/comparator words', async () => {
    renderForm();
    // Default VOLUME: no Region/Service type.
    expect(screen.queryByLabelText('Region')).not.toBeInTheDocument();
    await pickOption('Metric', 'Region volume');
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    await pickOption('Metric', 'Service type volume');
    expect(screen.getByLabelText('Service type')).toBeInTheDocument();
    await pickOption('Metric', 'On-time arrival');
    expect(screen.getByText(/at least/)).toBeInTheDocument();
    expect(screen.getByText(/%/)).toBeInTheDocument();
    await pickOption('Metric', "Can't-do rate");
    expect(screen.getByText(/at most/)).toBeInTheDocument();
    await pickOption('Metric', 'Reliability index');
    expect(screen.getByText(/points/)).toBeInTheDocument();
  });

  it('loads Starts from the periods route with count=13', () => {
    renderForm();
    expect(mockUseProgramPeriods).toHaveBeenCalledWith(
      expect.objectContaining({ periodType: 'WEEKLY', direction: 'upcoming', count: 13, enabled: true }),
    );
  });

  it('submits the exact create body and returns to the Goals tab', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Title'), 'Weekly ten');
    await userEvent.type(screen.getByLabelText('Target'), '10');
    await userEvent.type(screen.getByLabelText('Bonus (AUD)'), '30');
    await pickOption('Starts', 'Week of Mon 9 Nov 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledTimes(1));
    expect(createGoal).toHaveBeenCalledWith({
      title: 'Weekly ten', metric: 'VOLUME', period: 'WEEKLY', target: 10, rewardAmount: 30, startsAt: '2026-11-09',
    });
    expect(showSuccess).toHaveBeenCalledWith('Goal created');
    expect(mockNavigate).toHaveBeenCalledWith('/goals-rewards?tab=goals');
  });

  it('surfaces a 422 server message at the top', async () => {
    createGoal.mockRejectedValue({ status: 422, message: 'End must be later', code: 'GOAL_END_IN_CURRENT_PERIOD' });
    renderForm();
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.type(screen.getByLabelText('Target'), '1');
    await userEvent.type(screen.getByLabelText('Bonus (AUD)'), '1');
    await pickOption('Starts', 'Week of Mon 9 Nov 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() => expect(screen.getByText('End must be later')).toBeInTheDocument());
  });
});

describe('GoalFormPage — edit', () => {
  beforeEach(() => {
    mockParams.goalId = 'g1';
  });

  it('disables metric/period/scope/start with the locked hint and starts Save disabled', () => {
    setGoal(goal({ metric: 'REGION_VOLUME', scopeRegionId: 'r1', scopeRegionName: 'Sydney North' }));
    renderForm();
    expect(screen.getByRole('button', { name: 'Metric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Period' })).toBeDisabled();
    expect(screen.getAllByText('Create a new goal to change this.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sends only the changed fields on save', async () => {
    setGoal(goal());
    renderForm();
    const target = screen.getByLabelText('Target');
    await userEvent.clear(target);
    await userEvent.type(target, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGoal).toHaveBeenCalledWith({ goalId: 'g1', patch: { target: 12 } }));
    expect(showSuccess).toHaveBeenCalledWith('Goal updated');
  });

  it('shows the next-period note and a pending change for a started goal', () => {
    setGoal(goal({ pendingChange: { target: 12, rewardAmount: 40, effectiveFrom: '2026-11-16' } }));
    renderForm();
    expect(screen.getByText('Changes to target and bonus apply from the next period.')).toBeInTheDocument();
    expect(screen.getByText('From Mon 16 Nov 2026: target 12, bonus $40.00.')).toBeInTheDocument();
  });

  it('warns and disables reactivation for a deleted-region goal', () => {
    setGoal(goal({ active: false, metric: 'REGION_VOLUME', scopeRegionId: 'r1', scopeRegionName: null, scopeRegionDeleted: true }));
    renderForm();
    expect(screen.getByText("This goal's region was deleted. It can't be reactivated.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate goal' })).toBeDisabled();
  });

  it('shows the cumulative-goals advisory', () => {
    setGoal(goal());
    mockUseGoals.mockReturnValue({
      goals: [{ id: 'g2', scopeInspectorId: null }, { id: 'g3', scopeInspectorId: null }],
      meta: null, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderForm();
    expect(screen.getByText('Inspectors can earn this on top of 2 other active weekly goals.')).toBeInTheDocument();
  });

  it('shows "Counts again from" when the goal has a resume date', () => {
    setGoal(goal({ active: false, resumesOn: '2026-12-21' }));
    renderForm();
    expect(screen.getByText('Counts again from Mon 21 Dec 2026')).toBeInTheDocument();
  });

  it('renders not-found with a back link', () => {
    setGoal(null, { isNotFound: true });
    renderForm();
    expect(screen.getByText('Goal not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to goals' })).toBeInTheDocument();
  });
});

describe('GoalFormPage — lifecycle & back', () => {
  beforeEach(() => {
    mockParams.goalId = 'g1';
  });

  it('deactivates via a dialog', async () => {
    setGoal(goal());
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate goal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(updateGoal).toHaveBeenCalledWith({ goalId: 'g1', patch: { active: false } }));
    expect(showSuccess).toHaveBeenCalledWith('Goal deactivated');
  });

  it('reactivates via a dialog showing the resume date', async () => {
    setGoal(goal({ active: false }));
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate goal' }));
    expect(screen.getByText(/It counts again from Mon 9 Nov 2026\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(updateGoal).toHaveBeenCalledWith({ goalId: 'g1', patch: { active: true } }));
    expect(showSuccess).toHaveBeenCalledWith('Goal reactivated');
  });

  it('confirms before leaving with unsaved changes', async () => {
    setGoal(goal());
    renderForm();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Changed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(mockNavigate).toHaveBeenCalledWith('/goals-rewards?tab=goals');
  });
});
