import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartInspectionButton } from '../StartInspectionButton';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('StartInspectionButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.useRealTimers();
  });

  function formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatTimeSlot(date: Date): string {
    const end = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const endHh = String(end.getHours()).padStart(2, '0');
    const endMm = String(end.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}-${endHh}:${endMm}`;
  }

  it('is disabled when appointment is not today', () => {
    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate="2099-12-31"
        timeSlot="09:00-11:00"
      />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel')).toHaveTextContent('Available on inspection day');
  });

  it('is enabled when within time window', () => {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60 * 1000); // 10 min in future

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate={formatDateKey(start)}
        timeSlot={formatTimeSlot(start)}
      />,
    );

    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Start Inspection');
  });

  it('navigates to execution on click', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60 * 1000);

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate={formatDateKey(start)}
        timeSlot={formatTimeSlot(start)}
      />,
    );

    await user.click(screen.getByTestId('start-inspection-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/execution/apt-1');
  });

  it('shows countdown sublabel when before window', () => {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour in future

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate={formatDateKey(start)}
        timeSlot={formatTimeSlot(start)}
      />,
    );

    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('start-inspection-sublabel').textContent).toMatch(/Available in \d+ min/);
  });

  it('shows resume state when a local inspection is already in progress', () => {
    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        scheduledDate="2099-12-31"
        timeSlot="09:00-11:00"
        resume
      />,
    );

    const button = screen.getByTestId('start-inspection-button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Resume Inspection');
  });
});
