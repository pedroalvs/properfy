import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type { GoalResponse } from '@properfy/shared';
import { GoalsTab } from './GoalsTab';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof ReactRouterDom>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('../hooks/useGoals', () => ({ useGoals: vi.fn() }));
import { useGoals } from '../hooks/useGoals';
const mockUseGoals = useGoals as unknown as Mock;

function goal(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'g1',
    title: 'Weekly ten',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    period: 'WEEKLY',
    scopeRegionId: null,
    scopeServiceTypeId: null,
    scopeInspectorId: null,
    scopeRegionName: null,
    scopeServiceTypeName: null,
    scopeInspectorName: null,
    rewardAmount: 30,
    startsAt: '2026-11-02',
    endsAt: null,
    active: true,
    deactivatedAt: null,
    pendingChange: null,
    resumesOn: null,
    minEndsAt: '2026-11-08',
    currentPeriod: null,
    lastClosedPeriod: null,
    scopeRegionDeleted: false,
    createdByUserId: 'u1',
    updatedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function setGoals(state: Partial<ReturnType<typeof useGoals>> = {}) {
  mockUseGoals.mockReturnValue({
    goals: [goal()],
    meta: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...state,
  });
}

function renderTab() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GoalsTab />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseGoals.mockReset();
});

describe('GoalsTab', () => {
  it('lists goals with title + description, and defaults to active goals', () => {
    setGoals();
    renderTab();
    expect(screen.getByRole('button', { name: 'Open goal Weekly ten' })).toBeInTheDocument();
    expect(screen.getByText('Complete 10 inspections')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(mockUseGoals).toHaveBeenLastCalledWith({ active: true, metric: undefined, period: undefined });
  });

  it('maps Status Inactive → active:false and All → active:undefined', async () => {
    setGoals();
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(mockUseGoals).toHaveBeenLastCalledWith({ active: false, metric: undefined, period: undefined });

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(mockUseGoals).toHaveBeenLastCalledWith({ active: undefined, metric: undefined, period: undefined });
  });

  it('shows the empty state', () => {
    setGoals({ goals: [] });
    renderTab();
    expect(screen.getByText('No goals yet. Create one to start the program.')).toBeInTheDocument();
  });

  it('shows the error state with retry', () => {
    const refetch = vi.fn();
    setGoals({ goals: [], isError: true, refetch });
    renderTab();
    expect(screen.getByText("Couldn't load goals.")).toBeInTheDocument();
  });

  it('opens the form on the Goal button (keyboard-reachable) and on New goal', async () => {
    setGoals();
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Open goal Weekly ten' }));
    expect(mockNavigate).toHaveBeenCalledWith('/goals-rewards/goals/g1');

    await userEvent.click(screen.getByRole('button', { name: 'New goal' }));
    expect(mockNavigate).toHaveBeenCalledWith('/goals-rewards/goals/new');
  });

  it('renders the Who cohort for a region goal with a deleted region', () => {
    setGoals({
      goals: [goal({ metric: 'REGION_VOLUME', scopeRegionId: 'r1', scopeRegionName: null, scopeRegionDeleted: true })],
    });
    renderTab();
    expect(screen.getByText('Inspectors in a deleted region')).toBeInTheDocument();
    expect(screen.getByText('10 inspections in a deleted region')).toBeInTheDocument();
  });
});
