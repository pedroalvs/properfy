import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RewardAwardResponse } from '@properfy/shared';
import { RewardAwardsTable } from './components/RewardAwardsTable';
import { VoidAwardDialog } from './components/VoidAwardDialog';
import { GoalsRewardsPage } from './pages/GoalsRewardsPage';

// A11y is asserted via explicit ARIA/keyboard invariants — the web workspace has
// no axe engine (A11). This file guards the invariants not already covered by the
// per-component tests: no raw ids in the UI, action labels carry the inspector's
// name, dialogs are labelled, and the page exposes a proper tablist.

vi.mock('./components/GoalsTab', () => ({ GoalsTab: () => <div /> }));
vi.mock('./components/RewardsTab', () => ({ RewardsTab: () => <div /> }));

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function award(): RewardAwardResponse {
  return {
    id: UUID, goalId: UUID, inspectorId: UUID, periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08',
    goalTitle: 'Weekly ten', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
    achievedValue: 62, serviceCount: 62, achievedOn: '2026-11-07', indexScoreAtClose: 88.3, levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08', status: 'PENDING', approvedByUserId: null, approvedByName: null, approvedAt: null,
    paidAt: null, financialEntryId: null, invoice: null, voidedAfterInvoicing: false, voidedByUserId: null, voidedByName: null, voidedAt: null, voidReason: null, inspectorNote: null,
    goal: { id: UUID, title: 'Weekly ten' }, inspector: { id: UUID, name: 'Jane Doe', email: 'jane@x.com' },
    createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z',
  };
}

describe('inspector-program a11y invariants', () => {
  it('RewardAwardsTable renders no raw ids and labels actions with the inspector name', () => {
    const { container } = render(
      <RewardAwardsTable awards={[award()]} onApprove={vi.fn()} onVoid={vi.fn()} pendingId={null} />,
    );
    expect(UUID_RE.test(container.textContent ?? '')).toBe(false);
    expect(screen.getByRole('button', { name: 'Approve reward for Jane Doe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Void reward for Jane Doe' })).toBeInTheDocument();
  });

  it('VoidAwardDialog is a labelled dialog with labelled fields', () => {
    render(<VoidAwardDialog open inspectorName="Jane Doe" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Void reward' })).toBeInTheDocument();
    expect(screen.getByLabelText('Internal reason')).toBeInTheDocument();
    expect(screen.getByLabelText('Note to the inspector (optional)')).toBeInTheDocument();
  });

  it('GoalsRewardsPage exposes a tablist with Goals and Rewards tabs', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GoalsRewardsPage />
      </MemoryRouter>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rewards' })).toBeInTheDocument();
  });
});
