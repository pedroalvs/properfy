import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartInspectionButton } from '../StartInspectionButton';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

  it('is disabled for a past date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T10:00:00'));
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-24" timeSlotStart="09:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Inspection window has passed');
  });

  it('is enabled within the start window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T10:00:00'));
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="10:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Start Inspection');
  });

  it('shows a countdown before the window opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T10:00:00'));
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="11:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel').textContent).toMatch(/Available in \d+ min/);
  });

  it('is disabled after the start window has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T10:00:00'));
    renderWithProviders(
      <StartInspectionButton appointmentId="apt-1" scheduledDate="2026-03-25" timeSlotStart="07:00" />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Start window has passed');
  });

  it('navigates to execution on click within the window', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60 * 1000); // 10 min into the future, today

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate={formatDateKey(start)}
        timeSlotStart={formatHHmm(start)}
      />,
    );

    await user.click(screen.getByTestId('start-inspection-button'));
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
