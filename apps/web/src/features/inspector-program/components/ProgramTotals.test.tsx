import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgramTotals } from './ProgramTotals';
import { GoalSummaryTable } from './GoalSummaryTable';

const totals = { promised: 90, achieved: 30, approved: 30, paid: 0, pending: 0, voided: 0 };

describe('ProgramTotals', () => {
  it('shows the four tiles in AUD with the Promised help', () => {
    render(<ProgramTotals totals={totals} />);
    expect(screen.getByText('Promised')).toBeInTheDocument();
    expect(screen.getByText('$90.00')).toBeInTheDocument();
    expect(screen.getByText('Achieved')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(
      screen.getByLabelText('The most you could pay if every eligible inspector reached every goal.'),
    ).toBeInTheDocument();
  });
});

describe('GoalSummaryTable', () => {
  const baseGoal = {
    goalId: 'g1', title: 'Weekly ten', metric: 'VOLUME' as const, rewardAmount: 30,
    participants: 3, promised: 90, achievers: 1, achievedAmount: 30, closed: true, skipped: false,
  };

  it('renders per-goal promised × achieved', () => {
    render(<GoalSummaryTable goals={[baseGoal]} />);
    expect(screen.getByText('Weekly ten')).toBeInTheDocument();
    expect(screen.getByText('$90.00')).toBeInTheDocument(); // Max payout
    expect(screen.getAllByText('$30.00')).toHaveLength(2); // Per winner + Achieved
  });

  it('shows a skipped goal with Max payout $0.00', () => {
    render(<GoalSummaryTable goals={[{ ...baseGoal, skipped: true, promised: 0, achievers: 0, achievedAmount: 0 }]} />);
    expect(screen.getByText('Skipped (goal inactive)')).toBeInTheDocument();
    // Max payout + Achieved both $0.00 for a skipped goal.
    expect(screen.getAllByText('$0.00')).toHaveLength(2);
  });

  it('shows the empty message when no goals ran', () => {
    render(<GoalSummaryTable goals={[]} />);
    expect(screen.getByText('No goals ran in this period.')).toBeInTheDocument();
  });
});
