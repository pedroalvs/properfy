import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardSummaryCards } from './DashboardSummaryCards';

describe('DashboardSummaryCards', () => {
  const defaultProps = {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
    doneThisWeek: 7,
    scheduledThisWeek: 10,
    rejectedTotal: 5,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Row 1: status cards ──────────────────────────────────────────────────

  it('Row 1 renders 4 cards with correct status labels', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Rejected Total')).toBeInTheDocument();
  });

  it('Row 2 renders 3 cards with correct temporal labels', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    expect(screen.getByText('Done This Week')).toBeInTheDocument();
    expect(screen.getByText('Done This Month')).toBeInTheDocument();
    expect(screen.getByText('Scheduled This Week')).toBeInTheDocument();
  });

  it('Row 2 has a section label element above the row', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    // The section label is present as uppercase secondary text
    const sectionLabel = screen.getByTestId('temporal-section-label');
    expect(sectionLabel).toBeInTheDocument();
  });

  it('renders 7 stat cards total (4 + 3)', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(7);
  });

  // ─── Values ───────────────────────────────────────────────────────────────

  it('renders correct values for all cards', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('2')).toBeInTheDocument(); // draft
    expect(screen.getByText('4')).toBeInTheDocument(); // scheduled
    expect(screen.getByText('5')).toBeInTheDocument(); // rejectedTotal
    expect(screen.getByText('7')).toBeInTheDocument(); // doneThisWeek
    expect(screen.getByText('10')).toBeInTheDocument(); // scheduledThisWeek
  });

  it('renders zero values correctly', () => {
    render(
      <MemoryRouter>
        <DashboardSummaryCards
          draft={0}
          awaitingInspector={0}
          scheduled={0}
          doneThisMonth={0}
          doneThisWeek={0}
          scheduledThisWeek={0}
          rejectedTotal={0}
        />
      </MemoryRouter>,
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(7);
  });

  // ─── Row 1 grid structure ─────────────────────────────────────────────────

  it('Row 1 grid uses lg:grid-cols-4', () => {
    const { container } = render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    // The wrapper div contains two grids; the first is Row 1
    const wrapper = container.firstElementChild as HTMLElement;
    const row1 = wrapper.firstElementChild as HTMLElement;
    expect(row1.className).toContain('grid');
    expect(row1.className).toContain('grid-cols-1');
    expect(row1.className).toContain('sm:grid-cols-2');
    expect(row1.className).toContain('lg:grid-cols-4');
    expect(row1.className).toContain('gap-4');
  });

  // ─── Links ────────────────────────────────────────────────────────────────

  it('builds scheduled link with today date range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 25, 23, 30));

    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    // Link accessible name includes the value e.g. "4 Scheduled"
    expect(screen.getByRole('link', { name: /scheduled$/i })).toHaveAttribute(
      'href',
      '/appointments?status=SCHEDULED&fromDate=2026-03-25&toDate=2026-03-25',
    );
  });

  it('builds done this month link with month range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 25, 23, 30));

    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: /done this month/i })).toHaveAttribute(
      'href',
      '/appointments?status=DONE&fromDate=2026-03-01&toDate=2026-03-25',
    );
  });

  it('rejected total card links to /appointments?status=REJECTED', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: /rejected total/i })).toHaveAttribute(
      'href',
      '/appointments?status=REJECTED',
    );
  });

  it('done this week card links with week range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 25, 0, 0)); // Wednesday 25 Mar 2026

    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    const doneThisWeekLink = screen.getByRole('link', { name: /done this week/i });
    expect(doneThisWeekLink.getAttribute('href')).toContain('status=DONE');
    expect(doneThisWeekLink.getAttribute('href')).toContain('fromDate=');
    expect(doneThisWeekLink.getAttribute('href')).toContain('toDate=');
  });

  it('scheduled this week card links with week range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 25, 0, 0));

    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);

    const scheduledThisWeekLink = screen.getByRole('link', { name: /scheduled this week/i });
    expect(scheduledThisWeekLink.getAttribute('href')).toContain('status=SCHEDULED');
    expect(scheduledThisWeekLink.getAttribute('href')).toContain('fromDate=');
    expect(scheduledThisWeekLink.getAttribute('href')).toContain('toDate=');
  });
});
