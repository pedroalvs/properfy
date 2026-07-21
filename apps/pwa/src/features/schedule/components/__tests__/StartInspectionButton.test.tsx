import { screen, fireEvent } from '@testing-library/react';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { StartInspectionButton } from '../StartInspectionButton';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Sydney 2026-03-25 10:00 is AEDT (UTC+11) → 2026-03-24T23:00:00Z.
const SYDNEY_2026_03_25_10_00 = new Date('2026-03-24T23:00:00Z');

function sydneyDateOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sydneyHHmmOf(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

describe('StartInspectionButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled for a future date', () => {
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2099-12-31" timeSlotStart="09:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Available on inspection day');
  });

  it('is disabled for a past Sydney date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-24" timeSlotStart="09:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Inspection window has passed');
  });

  it('is enabled within the Sydney start window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="10:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Start Inspection');
  });

  it('shows a countdown before the window opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="11:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Available in 30 min');
  });

  it('is disabled after the start window has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="07:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Start window has passed');
  });

  it('gates on the Sydney date even when the device day differs', () => {
    vi.useFakeTimers();
    // 2026-03-25T20:00:00Z is still 25 Mar for a UTC device, but already
    // 26 Mar 07:00 in Sydney — a slot on the 25th must read as passed.
    vi.setSystemTime(new Date('2026-03-25T20:00:00Z'));
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="09:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Inspection window has passed');
  });

  it('navigates to execution on click within the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    const now = SYDNEY_2026_03_25_10_00;

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate={sydneyDateOf(now)}
        timeSlotStart={sydneyHHmmOf(now)}
      />,
    );

    fireEvent.click(screen.getByTestId('start-inspection-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/execution/apt-1');
  });

  it('shows resume state when a local inspection is already in progress', () => {
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2099-12-31" timeSlotStart="09:00" resume />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Resume Inspection');
  });
});
