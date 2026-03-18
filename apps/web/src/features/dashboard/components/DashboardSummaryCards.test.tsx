import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardSummaryCards } from './DashboardSummaryCards';

describe('DashboardSummaryCards', () => {
  const defaultProps = {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
  };

  it('renders four stat cards', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
  });

  it('renders correct labels', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Done This Month')).toBeInTheDocument();
  });

  it('renders correct values', () => {
    render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders zero values correctly', () => {
    render(
      <MemoryRouter>
        <DashboardSummaryCards
          draft={0}
          awaitingInspector={0}
          scheduled={0}
          doneThisMonth={0}
        />
      </MemoryRouter>,
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });

  it('container uses responsive grid classes', () => {
    const { container } = render(<MemoryRouter><DashboardSummaryCards {...defaultProps} /></MemoryRouter>);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    expect(grid.className).toContain('gap-4');
  });
});
