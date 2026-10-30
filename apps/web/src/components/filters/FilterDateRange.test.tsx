import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDateRange } from './FilterDateRange';

describe('FilterDateRange', () => {
  it('renders start and end date inputs', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
  });

  it('calls onStartChange when start date changes', () => {
    const onStartChange = vi.fn();
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={onStartChange}
        onEndChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Period - start'), {
      target: { value: '2026-01-01' },
    });
    expect(onStartChange).toHaveBeenCalledWith('2026-01-01');
  });

  it('calls onEndChange when end date changes', () => {
    const onEndChange = vi.fn();
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={onEndChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Period - end'), {
      target: { value: '2026-12-31' },
    });
    expect(onEndChange).toHaveBeenCalledWith('2026-12-31');
  });

  it('shows floating label when dates have values', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate="2026-01-01"
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(screen.getAllByText('Period').length).toBeGreaterThanOrEqual(1);
  });


  it('opens a calendar popover when a period field is clicked', async () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Choose date' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Period - start'));
    expect(await screen.findByRole('dialog', { name: 'Choose date' })).toBeInTheDocument();
  });

  it('is safe when showPicker is undefined (older browsers)', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(() => fireEvent.click(screen.getByLabelText('Period - start'))).not.toThrow();
  });

  // F00 — min/max/helperText pass-through (C9–C11 support).
  it('C9: applies min/max to both inputs', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
        min="2026-10-28"
        max="2026-11-11"
      />,
    );
    expect(screen.getByLabelText('Period - start')).toHaveAttribute('data-min', '2026-10-28');
    expect(screen.getByLabelText('Period - start')).toHaveAttribute('data-max', '2026-11-11');
    expect(screen.getByLabelText('Period - end')).toHaveAttribute('data-min', '2026-10-28');
    expect(screen.getByLabelText('Period - end')).toHaveAttribute('data-max', '2026-11-11');
  });

  it('C10: wires helperText to both inputs via aria-describedby', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
        helperText="Dates are limited to today + 14 days."
      />,
    );
    const help = screen.getByText('Dates are limited to today + 14 days.');
    expect(screen.getByLabelText('Period - start').getAttribute('aria-describedby') ?? '').toContain(help.id);
    expect(screen.getByLabelText('Period - end').getAttribute('aria-describedby') ?? '').toContain(help.id);
  });

  it('C11: no helper text or min/max by default', () => {
    render(
      <FilterDateRange
        label="Period"
        startDate=""
        endDate=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Period - start')).not.toHaveAttribute('data-min');
    expect(screen.queryByText(/limited to today/)).not.toBeInTheDocument();
  });
});
