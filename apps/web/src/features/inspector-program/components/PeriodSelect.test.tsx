import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodSelect } from './PeriodSelect';
import type { ProgramPeriodOption } from '../hooks/useProgramPeriods';

const periods: ProgramPeriodOption[] = [
  { start: '2026-11-02', end: '2026-11-08', status: 'IN_PROGRESS' },
  { start: '2026-10-26', end: '2026-11-01', status: 'CLOSED' },
];

describe('PeriodSelect', () => {
  it('renders period labels and emits the chosen start', async () => {
    const onChange = vi.fn();
    render(
      <PeriodSelect
        periodType="WEEKLY"
        periods={periods}
        value=""
        onChange={onChange}
        aria-label="Period"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Period' }));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Week of Mon 2 Nov 2026')).toBeInTheDocument();
    await userEvent.click(within(listbox).getByText('Week of Mon 26 Oct 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-10-26');
  });

  it('shows an "In progress" suffix when showStatus is set', async () => {
    render(
      <PeriodSelect
        periodType="WEEKLY"
        periods={periods}
        value=""
        onChange={vi.fn()}
        showStatus
        aria-label="Period"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Period' }));
    expect(screen.getByText('Week of Mon 2 Nov 2026 · In progress')).toBeInTheDocument();
  });
});
