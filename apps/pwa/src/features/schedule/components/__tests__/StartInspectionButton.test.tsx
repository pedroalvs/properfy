import { act, screen, fireEvent } from '@testing-library/react';
import { StartInspectionButton } from '../StartInspectionButton';
import { renderWithProviders } from '@/test-utils';

// Rendered without an AuthProvider; pin the effective timezone to Sydney.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Sydney 2026-03-25 10:00 is AEDT (UTC+11) → 2026-03-24T23:00:00Z.
const SYDNEY_2026_03_25_10_00 = new Date('2026-03-24T23:00:00Z');

describe('StartInspectionButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled for a future date', () => {
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2099-12-31" />);
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent(
      'Available on inspection day',
    );
  });

  it('is enabled on the scheduled day, before the time slot opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    // Slot starts at 14:00 — four hours away, and still startable.
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" />);
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Start Inspection');
    expect(screen.queryByTestId('start-inspection-sublabel')).not.toBeInTheDocument();
  });

  it('is enabled on the scheduled day, long after the time slot closed', () => {
    vi.useFakeTimers();
    // 23:30 Sydney on the scheduled day.
    vi.setSystemTime(new Date('2026-03-25T12:30:00Z'));
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" />);
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('is enabled for a past date — an overdue job is still executable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-24" />);
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(screen.queryByTestId('start-inspection-sublabel')).not.toBeInTheDocument();
  });

  it('is enabled for a date weeks in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-02-10" />);
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('gates on the Sydney date even when the device day differs', () => {
    vi.useFakeTimers();
    // 2026-03-25T20:00:00Z is still 25 Mar for a UTC device, but already
    // 26 Mar 07:00 in Sydney. A job scheduled for the 26th must be startable;
    // reading the device date would wrongly treat it as a future date.
    vi.setSystemTime(new Date('2026-03-25T20:00:00Z'));
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-26" />);
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('accepts a full ISO timestamp as the scheduled date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25T00:00:00.000Z" />,
    );
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('flips from disabled to enabled when Sydney midnight passes', () => {
    vi.useFakeTimers();
    // 23:59:50 Sydney on 24 Mar; the job is scheduled for the 25th.
    vi.setSystemTime(new Date('2026-03-24T12:59:50Z'));
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" />);
    expect(screen.getByTestId('start-inspection-button')).toBeDisabled();

    // Cross midnight; the polling interval must re-evaluate without a refresh.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId('start-inspection-button')).not.toBeDisabled();
  });

  it('navigates to execution on click', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(<StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" />);

    fireEvent.click(screen.getByTestId('start-inspection-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/execution/apt-1');
  });

  it('shows resume state when a local inspection is already in progress', () => {
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2099-12-31" resume />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Resume Inspection');
  });
});
