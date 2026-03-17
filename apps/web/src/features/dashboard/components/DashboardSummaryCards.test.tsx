import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardSummaryCards } from './DashboardSummaryCards';

describe('DashboardSummaryCards', () => {
  const defaultProps = {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
  };

  it('renders four stat cards', () => {
    render(<DashboardSummaryCards {...defaultProps} />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
  });

  it('renders correct labels', () => {
    render(<DashboardSummaryCards {...defaultProps} />);
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Aguardando Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Agendadas')).toBeInTheDocument();
    expect(screen.getByText('Concluídas este mês')).toBeInTheDocument();
  });

  it('renders correct values', () => {
    render(<DashboardSummaryCards {...defaultProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders zero values correctly', () => {
    render(
      <DashboardSummaryCards
        draft={0}
        awaitingInspector={0}
        scheduled={0}
        doneThisMonth={0}
      />,
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });

  it('container uses responsive grid classes', () => {
    const { container } = render(<DashboardSummaryCards {...defaultProps} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    expect(grid.className).toContain('gap-4');
  });
});
