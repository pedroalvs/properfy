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

  it('is disabled when appointment is not today', () => {
    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        timeSlotStart="2099-12-31T09:00:00.000Z"
        timeSlotEnd="2099-12-31T11:00:00.000Z"
      />,
    );
    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Available on inspection day');
  });

  it('is enabled when within time window', () => {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60 * 1000); // 10 min in future

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        timeSlotStart={start.toISOString()}
        timeSlotEnd={new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString()}
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
        timeSlotStart={start.toISOString()}
        timeSlotEnd={new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString()}
      />,
    );

    await user.click(screen.getByTestId('start-inspection-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/execution/apt-1');
  });

  it('shows countdown when before window', () => {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour in future

    renderWithProviders(
      <StartInspectionButton
        appointmentId="apt-1"
        timeSlotStart={start.toISOString()}
        timeSlotEnd={new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString()}
      />,
    );

    const button = screen.getByTestId('start-inspection-button');
    expect(button).toBeDisabled();
    expect(button.textContent).toMatch(/Available in \d+ min/);
  });
});
