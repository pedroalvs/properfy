import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DaySelectorStrip } from '../DaySelectorStrip';
import { renderWithProviders } from '@/test-utils';

// Rendered without an AuthProvider; pin the effective timezone to Sydney.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

describe('DaySelectorStrip', () => {
  const days = ['2026-03-18', '2026-03-19', '2026-03-20'];
  const onDaySelect = vi.fn();

  beforeEach(() => {
    onDaySelect.mockClear();
  });

  it('renders day chips for each day', () => {
    renderWithProviders(
      <DaySelectorStrip days={days} selectedDate={days[0]!} onDaySelect={onDaySelect} />,
    );
    expect(screen.getByTestId('day-selector-strip')).toBeInTheDocument();
    expect(screen.getByTestId('day-chip-2026-03-18')).toBeInTheDocument();
    expect(screen.getByTestId('day-chip-2026-03-19')).toBeInTheDocument();
    expect(screen.getByTestId('day-chip-2026-03-20')).toBeInTheDocument();
  });

  it('highlights selected day', () => {
    renderWithProviders(
      <DaySelectorStrip days={days} selectedDate="2026-03-19" onDaySelect={onDaySelect} />,
    );
    const chip = screen.getByTestId('day-chip-2026-03-19');
    expect(chip.className).toContain('bg-primary');
    expect(chip.className).toContain('text-primary-foreground');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onDaySelect when day is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DaySelectorStrip days={days} selectedDate={days[0]!} onDaySelect={onDaySelect} />,
    );
    await user.click(screen.getByTestId('day-chip-2026-03-20'));
    expect(onDaySelect).toHaveBeenCalledWith('2026-03-20');
  });

  it('renders the job count as the primary number with the date in the label (v3)', () => {
    const counts = { '2026-03-18': 3, '2026-03-20': 1 };
    renderWithProviders(
      <DaySelectorStrip
        days={days}
        selectedDate={days[0]!}
        onDaySelect={onDaySelect}
        appointmentCounts={counts}
      />,
    );
    // The count is the prominent number (carries the day-count testid).
    expect(screen.getByTestId('day-count-2026-03-18')).toHaveTextContent('3');
    expect(screen.getByTestId('day-count-2026-03-20')).toHaveTextContent('1');
    // The date now lives in the small label on each chip.
    expect(screen.getByTestId('day-chip-2026-03-18')).toHaveTextContent('18');
    expect(screen.getByTestId('day-chip-2026-03-20')).toHaveTextContent('20');
  });

  it('shows an em dash for a zero-job day and no count testid', () => {
    const counts = { '2026-03-18': 3 }; // 19 and 20 are zero-job days
    renderWithProviders(
      <DaySelectorStrip
        days={days}
        selectedDate={days[0]!}
        onDaySelect={onDaySelect}
        appointmentCounts={counts}
      />,
    );
    expect(screen.getByTestId('day-chip-2026-03-19')).toHaveTextContent('—');
    expect(screen.queryByTestId('day-count-2026-03-19')).not.toBeInTheDocument();
  });

  it('falls back to the date number when no counts are provided', () => {
    renderWithProviders(
      <DaySelectorStrip days={days} selectedDate={days[0]!} onDaySelect={onDaySelect} />,
    );
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.queryByTestId('day-count-2026-03-18')).not.toBeInTheDocument();
  });

  it('shows urgent indicator on days with urgent appointments', () => {
    const urgentDays = new Set(['2026-03-18', '2026-03-20']);
    renderWithProviders(
      <DaySelectorStrip
        days={days}
        selectedDate={days[0]!}
        onDaySelect={onDaySelect}
        urgentDays={urgentDays}
      />,
    );
    expect(screen.getByTestId('day-urgent-2026-03-18')).toBeInTheDocument();
    expect(screen.queryByTestId('day-urgent-2026-03-19')).not.toBeInTheDocument();
    expect(screen.getByTestId('day-urgent-2026-03-20')).toBeInTheDocument();
  });

  it('does not show urgent indicator when urgentDays is not provided', () => {
    renderWithProviders(
      <DaySelectorStrip days={days} selectedDate={days[0]!} onDaySelect={onDaySelect} />,
    );
    expect(screen.queryByTestId('day-urgent-2026-03-18')).not.toBeInTheDocument();
  });
});
