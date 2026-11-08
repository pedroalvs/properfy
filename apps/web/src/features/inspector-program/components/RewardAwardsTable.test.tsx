import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RewardAwardResponse } from '@properfy/shared';
import { RewardAwardsTable } from './RewardAwardsTable';

function award(overrides: Partial<RewardAwardResponse> = {}): RewardAwardResponse {
  return {
    id: 'a1', goalId: 'g1', inspectorId: 'i1', periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08',
    goalTitle: 'Weekly ten', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
    achievedValue: 62, serviceCount: 62, achievedOn: '2026-11-07', indexScoreAtClose: 88.3, levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08', status: 'PENDING', approvedByUserId: null, approvedByName: null, approvedAt: null,
    paidAt: null, voidedByUserId: null, voidedByName: null, voidedAt: null, voidReason: null, inspectorNote: null,
    goal: { id: 'g1', title: 'Weekly ten' }, inspector: { id: 'i1', name: 'Jane Doe', email: 'jane@x.com' },
    createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z', ...overrides,
  };
}

function renderTable(awards: RewardAwardResponse[], extra: Partial<Parameters<typeof RewardAwardsTable>[0]> = {}) {
  return render(
    <RewardAwardsTable awards={awards} onApprove={vi.fn()} onVoid={vi.fn()} pendingId={null} {...extra} />,
  );
}

describe('RewardAwardsTable', () => {
  it('renders inspector, result, level and the shared status label', () => {
    renderTable([award()]);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@x.com')).toBeInTheDocument();
    expect(screen.getByText('62 inspections')).toBeInTheDocument();
    expect(screen.getByText('Complete 10 inspections')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  it('renders a rate result as a percentage', () => {
    renderTable([award({ metric: 'PUNCTUALITY', achievedValue: 96.4 })]);
    expect(screen.getByText('96.4%')).toBeInTheDocument();
  });

  it('shows Approve + Void on PENDING, calls onApprove', async () => {
    const onApprove = vi.fn();
    renderTable([award()], { onApprove });
    await userEvent.click(screen.getByRole('button', { name: 'Approve reward for Jane Doe' }));
    expect(onApprove).toHaveBeenCalledWith('a1');
    expect(screen.getByRole('button', { name: 'Void reward for Jane Doe' })).toBeInTheDocument();
  });

  it('shows only Void on APPROVED and no manual-payment control anywhere', () => {
    renderTable([award({ status: 'APPROVED' })]);
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Void reward for Jane Doe' })).toBeInTheDocument();
    expect(screen.queryByText(/Mark as paid/i)).not.toBeInTheDocument();
  });

  it('offers no action on PAID or VOID', () => {
    renderTable([award({ id: 'a1', status: 'PAID' }), award({ id: 'a2', status: 'VOID', inspector: { id: 'i2', name: 'Bob', email: 'b@x.com' } })]);
    expect(screen.queryByRole('button', { name: /Approve|Void/ })).not.toBeInTheDocument();
  });

  it('disables a row whose action is in flight', () => {
    renderTable([award()], { pendingId: 'a1' });
    expect(screen.getByRole('button', { name: 'Approve reward for Jane Doe' })).toBeDisabled();
  });

  it('disables every row while any action is in flight (M1: no collapsed second action)', () => {
    renderTable(
      [award(), award({ id: 'a2', inspector: { id: 'i2', name: 'Bob Reid', email: 'bob@x.com' } })],
      { pendingId: 'a1' },
    );
    // The other row's actions are disabled too, so a second action can't start.
    expect(screen.getByRole('button', { name: 'Approve reward for Bob Reid' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Void reward for Bob Reid' })).toBeDisabled();
  });

  it('shows "–" for a null level / index', () => {
    renderTable([award({ levelAtClose: null, indexScoreAtClose: null })]);
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(1);
  });
});
