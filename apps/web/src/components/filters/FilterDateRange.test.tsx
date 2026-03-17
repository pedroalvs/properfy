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
    expect(screen.getByText('Period')).toBeInTheDocument();
  });
});
