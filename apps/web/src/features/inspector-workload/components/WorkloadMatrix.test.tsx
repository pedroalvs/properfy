import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InspectorWorkloadResponse } from '@properfy/shared';
import { WorkloadMatrix } from './WorkloadMatrix';

const WEEK: InspectorWorkloadResponse['week'] = {
  weekStart: '2026-07-27',
  weekEnd: '2026-08-02',
  days: [
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
  ],
};

const THRESHOLDS: InspectorWorkloadResponse['thresholds'] = {
  weeklyBusy: 15,
  weeklyOverloaded: 18,
  dailyBusy: 3,
  dailyOverloaded: 4,
};

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function matrixWith(inspectors: InspectorWorkloadResponse['matrix']['inspectors']) {
  const teamTotalsByDay = WEEK.days.map((_, index) =>
    inspectors.reduce((sum, row) => sum + (row.days[index] ?? 0), 0),
  );
  return {
    inspectors,
    teamTotalsByDay,
    teamTotal: teamTotalsByDay.reduce((sum, count) => sum + count, 0),
  };
}

const BUSY_ALICE = {
  inspectorId: ALICE,
  inspectorName: 'Alice',
  isActive: true,
  days: [3, 3, 3, 3, 2, 1, 1],
  total: 16,
  level: 'busy' as const,
};

const IDLE_BOB = {
  inspectorId: BOB,
  inspectorName: 'Bob',
  isActive: true,
  days: [0, 0, 0, 0, 0, 0, 0],
  total: 0,
  level: 'normal' as const,
};

function renderMatrix(inspectors = [BUSY_ALICE, IDLE_BOB]) {
  return render(
    <WorkloadMatrix matrix={matrixWith(inspectors)} week={WEEK} thresholds={THRESHOLDS} />,
  );
}

describe('WorkloadMatrix', () => {
  it('renders a row of zeros for an inspector with no work', () => {
    renderMatrix();

    const bobRow = screen.getByRole('row', { name: /Bob/ });
    const cells = within(bobRow).getAllByRole('cell');
    // Seven day cells plus the weekly total.
    expect(cells).toHaveLength(8);
    expect(cells.slice(0, 7).map((cell) => cell.textContent)).toEqual(['0', '0', '0', '0', '0', '0', '0']);
  });

  it('labels each cell with the inspector, day, count and level', () => {
    renderMatrix();

    expect(
      screen.getByTitle('Alice — Mon 27 Jul: 3 inspections (Busy)'),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('Alice — Sat 1 Aug: 1 inspections (Normal)'),
    ).toBeInTheDocument();
  });

  it('names the weekly total with its level, so colour is never the only signal', () => {
    renderMatrix();

    expect(screen.getByLabelText('16 inspections this week — Busy')).toBeInTheDocument();
  });

  it('renders the team total row', () => {
    renderMatrix();

    const footer = screen.getByRole('row', { name: /Team total/ });
    expect(within(footer).getByText('16')).toBeInTheDocument();
  });

  it('marks an off-roster inspector as inactive', () => {
    renderMatrix([{ ...BUSY_ALICE, isActive: false }]);

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  /**
   * Busy and overloaded days use the status palette (warning / error tints) so a heavy
   * day reads as a state at a glance; days under the busy threshold keep the neutral
   * sequential wash. Rule unchanged — only the colours moved to the status palette.
   */
  it('tints busy days with the warning colour and overloaded days with the error colour', () => {
    renderMatrix([
      {
        inspectorId: ALICE,
        inspectorName: 'Alice',
        isActive: true,
        days: [3, 4, 1, 0, 0, 0, 0],
        total: 8,
        level: 'normal' as const,
      },
    ]);

    expect(screen.getByTitle('Alice — Mon 27 Jul: 3 inspections (Busy)')).toHaveStyle({
      backgroundColor: 'rgba(251, 140, 0, 0.2)',
    });
    expect(screen.getByTitle('Alice — Tue 28 Jul: 4 inspections (Overloaded)')).toHaveStyle({
      backgroundColor: 'rgba(255, 82, 82, 0.25)',
    });
    expect(screen.getByTitle('Alice — Wed 29 Jul: 1 inspections (Normal)')).toHaveStyle({
      backgroundColor: 'rgba(33, 86, 110, 0.12)',
    });
  });

  it('shows a legend describing the daily bands', () => {
    renderMatrix();

    expect(screen.getByText('Under 3 a day')).toBeInTheDocument();
    expect(screen.getByText('3–3 a day')).toBeInTheDocument();
    expect(screen.getByText('4+ a day')).toBeInTheDocument();
  });

  it('paints the legend swatches with the same colours as the cells', () => {
    renderMatrix();

    expect(screen.getByText('Under 3 a day').querySelector('span')).toHaveStyle({
      backgroundColor: 'rgba(33, 86, 110, 0.12)',
    });
    expect(screen.getByText('3–3 a day').querySelector('span')).toHaveStyle({
      backgroundColor: 'rgba(251, 140, 0, 0.2)',
    });
    expect(screen.getByText('4+ a day').querySelector('span')).toHaveStyle({
      backgroundColor: 'rgba(255, 82, 82, 0.25)',
    });
  });

  it('exposes a table view that spells the level out in words', async () => {
    const user = userEvent.setup();
    renderMatrix();

    await user.click(screen.getByRole('button', { name: /Table/ }));

    expect(screen.getByRole('columnheader', { name: 'Level' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Busy' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Normal' })).toBeInTheDocument();
  });

  it('tells the operator when nobody is carrying work', () => {
    renderMatrix([]);

    expect(screen.getByText('No inspectors are carrying work this week.')).toBeInTheDocument();
  });
});
