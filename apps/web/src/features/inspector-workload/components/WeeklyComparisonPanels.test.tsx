import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InspectorWorkloadResponse, WeekFunnel } from '@properfy/shared';
import { WeeklyComparisonPanels } from './WeeklyComparisonPanels';
import { CompletedSummary } from './CompletedSummary';

function week(
  weekStart: string,
  weekEnd: string,
  overrides: Partial<WeekFunnel> = {},
): WeekFunnel {
  return {
    weekStart,
    weekEnd,
    done: 0,
    scheduled: 0,
    confirmed: 0,
    confirmationEligible: 0,
    ...overrides,
  };
}

const FUNNEL: InspectorWorkloadResponse['funnel'] = {
  previous: week('2026-07-20', '2026-07-26', { done: 12, scheduled: 12, confirmed: 12 }),
  selected: week('2026-07-27', '2026-08-02', { done: 5, scheduled: 20, confirmed: 15 }),
  next: week('2026-08-03', '2026-08-09', { done: 0, scheduled: 10, confirmed: 4 }),
};

describe('WeeklyComparisonPanels', () => {
  it('names the three weeks with their date ranges', () => {
    render(<WeeklyComparisonPanels funnel={FUNNEL} />);

    expect(screen.getByText('Selected week')).toBeInTheDocument();
    expect(screen.getByText('Mon 27 Jul – Sun 2 Aug 2026')).toBeInTheDocument();
  });

  it('reports each stage as a share of that week s scheduled work', async () => {
    const user = userEvent.setup();
    render(<WeeklyComparisonPanels funnel={FUNNEL} />);

    await user.click(screen.getByRole('button', { name: /Table/ }));

    const selectedRow = screen.getByRole('row', { name: /Selected week/ });
    // 5 of 20 done, 15 of 20 confirmed.
    expect(within(selectedRow).getByText('25%')).toBeInTheDocument();
    expect(within(selectedRow).getByText('75%')).toBeInTheDocument();
  });

  it('shows an em dash, never 0% or NaN, for a week with nothing scheduled', async () => {
    const user = userEvent.setup();
    render(
      <WeeklyComparisonPanels
        funnel={{ ...FUNNEL, next: week('2026-08-03', '2026-08-09') }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Table/ }));

    const nextRow = screen.getByRole('row', { name: /Next week/ });
    expect(within(nextRow).getAllByText('—')).toHaveLength(2);
  });

  it('scales every panel against the busiest week so the bars are comparable', () => {
    const { container } = render(<WeeklyComparisonPanels funnel={FUNNEL} />);

    const widths = Array.from(container.querySelectorAll<HTMLElement>('.h-full.rounded-full')).map(
      (bar) => bar.style.width,
    );

    // Selected week is the busiest at 20 scheduled, so its Scheduled bar is the
    // only full-width one; the previous week's 12 must render narrower rather
    // than also filling its own panel.
    expect(widths).toContain('100%');
    expect(widths).toContain('60%');
  });
});

describe('CompletedSummary', () => {
  const COMPLETED: InspectorWorkloadResponse['completed'] = {
    doneSelectedWeek: 5,
    donePreviousWeek: 12,
    doneSelectedMonth: 40,
    donePreviousMonth: 38,
    selectedMonth: '2026-07',
    previousMonth: '2026-06',
  };

  it('spells out the months rather than showing raw YYYY-MM', () => {
    render(<CompletedSummary completed={COMPLETED} />);

    expect(screen.getByText('Done in July 2026')).toBeInTheDocument();
    expect(screen.getByText(/vs June 2026 \(38\)/)).toBeInTheDocument();
  });

  it('signs the delta in both directions', () => {
    render(<CompletedSummary completed={COMPLETED} />);

    expect(screen.getByText('-7')).toBeInTheDocument(); // week: 5 vs 12
    expect(screen.getByText('+2')).toBeInTheDocument(); // month: 40 vs 38
  });

  it('says level rather than showing a zero delta', () => {
    render(
      <CompletedSummary completed={{ ...COMPLETED, doneSelectedWeek: 12 }} />,
    );

    expect(screen.getByText('Level with 12')).toBeInTheDocument();
  });

  it('captions the figures with the date key they are counted on', () => {
    render(<CompletedSummary completed={COMPLETED} />);

    expect(screen.getByText(/by scheduled date/)).toBeInTheDocument();
  });
});
