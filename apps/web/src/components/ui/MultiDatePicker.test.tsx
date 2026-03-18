import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MultiDatePicker } from './MultiDatePicker';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 18)); // March 18, 2026
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MultiDatePicker', () => {
  it('renders the current month and year', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    expect(screen.getByText('March 2026')).toBeInTheDocument();
  });

  it('renders weekday headers', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('renders day numbers for the current month', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    // March 2026 has 31 days
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('disables past dates', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    const pastDayButton = screen.getByLabelText(/March 17, 2026/);
    expect(pastDayButton).toBeDisabled();
  });

  it('enables future dates', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    const futureDayButton = screen.getByLabelText(/March 20, 2026/);
    expect(futureDayButton).not.toBeDisabled();
  });

  it('toggles a date on click', () => {
    const onChange = vi.fn();
    render(<MultiDatePicker selectedDates={[]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(/March 20, 2026/));

    expect(onChange).toHaveBeenCalledWith(['2026-03-20']);
  });

  it('removes a date when clicking a selected date', () => {
    const onChange = vi.fn();
    render(
      <MultiDatePicker
        selectedDates={['2026-03-20', '2026-03-25']}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText(/March 20, 2026/));

    expect(onChange).toHaveBeenCalledWith(['2026-03-25']);
  });

  it('highlights selected dates', () => {
    render(
      <MultiDatePicker
        selectedDates={['2026-03-20']}
        onChange={() => {}}
      />,
    );

    const selectedButton = screen.getByLabelText(/March 20, 2026/);
    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(selectedButton).toHaveClass('bg-primary');
  });

  it('renders selected dates as removable chips', () => {
    render(
      <MultiDatePicker
        selectedDates={['2026-03-20', '2026-03-25']}
        onChange={() => {}}
      />,
    );

    const chipsContainer = screen.getByLabelText('Selected dates');
    expect(within(chipsContainer).getByText('Mar 20')).toBeInTheDocument();
    expect(within(chipsContainer).getByText('Mar 25')).toBeInTheDocument();
  });

  it('removes a date via chip close button', () => {
    const onChange = vi.fn();
    render(
      <MultiDatePicker
        selectedDates={['2026-03-20', '2026-03-25']}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Remove Mar 20'));

    expect(onChange).toHaveBeenCalledWith(['2026-03-25']);
  });

  it('does not render chips when no dates selected', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    expect(screen.queryByLabelText('Selected dates')).not.toBeInTheDocument();
  });

  it('navigates to next month', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('Next month'));

    expect(screen.getByText('April 2026')).toBeInTheDocument();
  });

  it('navigates to previous month', () => {
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('Previous month'));

    expect(screen.getByText('February 2026')).toBeInTheDocument();
  });

  it('wraps year when navigating past December', () => {
    vi.setSystemTime(new Date(2026, 11, 15)); // December 2026
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    expect(screen.getByText('December 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next month'));

    expect(screen.getByText('January 2027')).toBeInTheDocument();
  });

  it('wraps year when navigating before January', () => {
    vi.setSystemTime(new Date(2026, 0, 15)); // January 2026
    render(<MultiDatePicker selectedDates={[]} onChange={() => {}} />);

    expect(screen.getByText('January 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Previous month'));

    expect(screen.getByText('December 2025')).toBeInTheDocument();
  });

  it('respects maxDate prop', () => {
    render(
      <MultiDatePicker
        selectedDates={[]}
        onChange={() => {}}
        maxDate="2026-03-25"
      />,
    );

    const withinRange = screen.getByLabelText(/March 25, 2026/);
    expect(withinRange).not.toBeDisabled();

    const beyondRange = screen.getByLabelText(/March 26, 2026/);
    expect(beyondRange).toBeDisabled();
  });

  it('respects minDate prop when it is after today', () => {
    render(
      <MultiDatePicker
        selectedDates={[]}
        onChange={() => {}}
        minDate="2026-03-22"
      />,
    );

    // March 20 is after today (18th) but before minDate (22nd), so disabled
    const beforeMin = screen.getByLabelText(/March 20, 2026/);
    expect(beforeMin).toBeDisabled();

    const atMin = screen.getByLabelText(/March 22, 2026/);
    expect(atMin).not.toBeDisabled();
  });

  it('sorts dates when adding a new one', () => {
    const onChange = vi.fn();
    render(
      <MultiDatePicker
        selectedDates={['2026-03-25']}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText(/March 20, 2026/));

    expect(onChange).toHaveBeenCalledWith(['2026-03-20', '2026-03-25']);
  });
});
