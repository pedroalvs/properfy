import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DonePanel } from '../DonePanel';
import { renderWithProviders } from '@/test-utils';
import { buildStop } from '@/features/day-plan/__fixtures__/day-plan';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('DonePanel', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders success message', () => {
    renderWithProviders(<DonePanel />);
    expect(screen.getByText('Inspection Complete')).toBeInTheDocument();
  });

  it('navigates to schedule on button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DonePanel />);
    await user.click(screen.getByTestId('back-to-schedule'));
    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });

  it('shows the offline pendingSync message and still navigates back to schedule', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DonePanel pendingSync onBack={onBack} />);

    expect(screen.getByText('Inspection Saved Locally')).toBeInTheDocument();
    expect(screen.queryByText('Inspection Complete')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('back-to-schedule'));
    expect(onBack).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });

  it('surfaces the next inspection with a navigate action when a next stop exists', () => {
    const next = buildStop({
      appointmentId: 'next-apt',
      propertyAddress: '2/246 Willoughby Rd, Naremburn NSW 2065',
      suburb: 'Naremburn',
    });
    renderWithProviders(<DonePanel nextStop={next} />);

    expect(screen.getByTestId('next-inspection')).toBeInTheDocument();
    expect(screen.getByText('NEXT INSPECTION')).toBeInTheDocument();
    expect(screen.getByText('2/246 Willoughby Rd, Naremburn NSW 2065')).toBeInTheDocument();
    expect(screen.getByTestId('navigate-button')).toBeInTheDocument();
    // Opening the inspection detail stays available via the card body link.
    expect(screen.getByRole('link', { name: /navigate/i })).toBeInTheDocument();
    // Back to Schedule remains, now as a secondary action.
    expect(screen.getByTestId('back-to-schedule')).toBeInTheDocument();
  });

  it('shows only Back to Schedule when there is no next stop', () => {
    renderWithProviders(<DonePanel />);

    expect(screen.queryByTestId('next-inspection')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navigate-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-done-today')).not.toBeInTheDocument();
    expect(screen.getByTestId('back-to-schedule')).toBeInTheDocument();
  });

  it('shows an "all done for today" affordance on the last stop of the day', () => {
    renderWithProviders(<DonePanel allDone />);

    expect(screen.getByTestId('all-done-today')).toBeInTheDocument();
    expect(screen.queryByTestId('next-inspection')).not.toBeInTheDocument();
    expect(screen.getByTestId('back-to-schedule')).toBeInTheDocument();
  });
});
