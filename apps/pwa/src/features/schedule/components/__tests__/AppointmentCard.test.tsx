import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AppointmentCard } from '../AppointmentCard';
import { renderWithProviders } from '@/test-utils';
import { AppointmentStatus, ApiError, RentalTenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import type { InspectorAppointment } from '../../types';

vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Snackbar spies (SnackbarProvider is a passthrough so renderWithProviders works).
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockShowInfo = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError, showInfo: mockShowInfo, dismiss: vi.fn(), messages: [] }),
  SnackbarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUseIsOnline = vi.fn();
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => mockUseIsOnline() }));

const mockCaptureRequiredLocation = vi.fn();
vi.mock('@/features/execution/lib/geolocation', () => ({
  captureRequiredLocation: (...args: unknown[]) => mockCaptureRequiredLocation(...args),
}));

// Control the execution phase + spy the actions the card drives.
const mockCheckIn = vi.fn();
const mockRequestCheckOut = vi.fn();
let mockActions: Record<string, unknown>;
vi.mock('@/features/execution/hooks/useExecutionActions', () => ({
  useExecutionActions: () => mockActions,
}));

// Stub the sheets — they have their own tests; here we only assert they open.
vi.mock('@/features/field-events/components/CantDoSheet', () => ({
  CantDoSheet: ({ open }: { open: boolean }) => <div data-testid="cant-do-sheet" data-open={open} />,
}));
vi.mock('@/features/field-events/components/LateNoticeSheet', () => ({
  LateNoticeSheet: ({ open }: { open: boolean }) => <div data-testid="late-sheet" data-open={open} />,
}));

function makeActions(phase: string): Record<string, unknown> {
  return {
    state: { phase, startedAt: null },
    isRestored: true,
    checkIn: mockCheckIn,
    requestCheckOut: mockRequestCheckOut,
    confirmStep: null,
    confirmSync: vi.fn(),
    confirmPastTime: vi.fn(),
    cancelConfirm: vi.fn(),
    clearState: vi.fn(),
    proceedToFinish: vi.fn(),
    submit: vi.fn(),
    retry: vi.fn(),
    updateState: vi.fn(),
    isStarting: false,
    isSubmitting: false,
  };
}

const TODAY = '2026-03-18';
const baseAppointment: InspectorAppointment = {
  id: 'apt-1',
  appointmentCode: 'INS-0042',
  propertyAddress: '123 Collins St',
  suburb: 'Melbourne',
  scheduledDate: TODAY,
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  status: AppointmentStatus.SCHEDULED,
  rentalTenantConfirmation: RentalTenantConfirmationStatus.CONFIRMED,
  serviceTypeName: 'Routine Inspection',
  flowType: ServiceTypeFlowType.ROUTINE,
  rentalTenantName: 'John Doe',
  rentalTenantPhone: '+61400000000',
  rentalTenantEmail: 'john@test.com',
  keyRequired: false,
  meetingLocation: null,
  restrictions: null,
  propertyLatitude: -37.8136,
  propertyLongitude: 144.9631,
  notes: null,
  apps: [],
  customFields: [],
};

const LOCATION = { latitude: -37.8, longitude: 144.96, accuracy: 8, capturedAt: '2026-03-18T09:42:00.000+11:00' };

beforeEach(() => {
  mockNavigate.mockClear();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockShowInfo.mockReset();
  mockCheckIn.mockReset();
  mockRequestCheckOut.mockReset();
  mockCaptureRequiredLocation.mockReset().mockResolvedValue(LOCATION);
  mockUseIsOnline.mockReset().mockReturnValue(true);
  mockActions = makeActions('PRE_START');
});

describe('AppointmentCard — content and structure', () => {
  it('renders details, code, time window and confirmation badge', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    expect(screen.getByText('123 Collins St, Melbourne')).toBeInTheDocument();
    expect(screen.getByTestId('appointment-code')).toHaveTextContent('INS-0042');
    expect(screen.getByText('9:00 am – 11:00 am')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-badge')).toBeInTheDocument();
  });

  it('navigates to the detail when the card body is tapped, but not when an action is tapped', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    await user.click(screen.getByTestId('appointment-card-apt-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/schedule/apt-1');

    mockNavigate.mockClear();
    await user.click(screen.getByTestId('card-more-actions'));
    expect(mockNavigate).not.toHaveBeenCalled();
    // No <button> nested inside another <button>.
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('puts the status accent border on the article', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    const article = screen.getByTestId('appointment-card-apt-1').closest('article')!;
    expect(article.className).toContain('border-l-primary');
  });

  it('shows no action bar for DONE / REJECTED / CANCELLED', () => {
    for (const status of [AppointmentStatus.DONE, AppointmentStatus.REJECTED, AppointmentStatus.CANCELLED]) {
      const { unmount } = renderWithProviders(
        <AppointmentCard appointment={{ ...baseAppointment, status }} today={TODAY} />,
      );
      expect(screen.queryByTestId('card-primary-action')).not.toBeInTheDocument();
      expect(screen.queryByTestId('card-more-actions')).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('AppointmentCard — check in / out', () => {
  it('shows Check in for a not-started job today and Check out when in progress', () => {
    const { unmount } = renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    expect(screen.getByTestId('card-primary-action')).toHaveTextContent('Check in');
    unmount();

    mockActions = makeActions('IN_PROGRESS');
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    expect(screen.getByTestId('card-primary-action')).toHaveTextContent('Check out');
  });

  it('disables Check in on a future day with an availability note', () => {
    renderWithProviders(<AppointmentCard appointment={{ ...baseAppointment, scheduledDate: '2099-01-01' }} today={TODAY} />);
    expect(screen.getByTestId('card-primary-action')).toBeDisabled();
    expect(screen.getByText('Available on inspection day')).toBeInTheDocument();
  });

  it('checks in with the captured location and confirms with a time', async () => {
    const user = userEvent.setup();
    mockCheckIn.mockResolvedValue({ startedAt: '2026-03-18T09:42:00.000+11:00', outOfRadius: false });
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);

    await user.click(screen.getByTestId('card-primary-action'));

    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith(LOCATION));
    expect(mockShowSuccess).toHaveBeenCalledWith('Checked in at 09:42');
  });

  it('warns when the check-in is accepted out of radius (FLAG)', async () => {
    const user = userEvent.setup();
    mockCheckIn.mockResolvedValue({ startedAt: '2026-03-18T09:42:00.000+11:00', outOfRadius: true, geolocationDistanceMeters: 640 });
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);

    await user.click(screen.getByTestId('card-primary-action'));

    await waitFor(() =>
      expect(mockShowInfo).toHaveBeenCalledWith(
        "You're 640 m from the property. Operations will see this check-in.",
      ),
    );
  });

  it('surfaces the server message and stays on Check in for a BLOCK 422', async () => {
    const user = userEvent.setup();
    mockCheckIn.mockRejectedValue(new ApiError(422, 'You are 640 m from the property.', 'GEOFENCE_OUT_OF_RADIUS'));
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);

    await user.click(screen.getByTestId('card-primary-action'));

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('You are 640 m from the property.'));
    expect(screen.getByTestId('card-primary-action')).toHaveTextContent('Check in');
  });

  it('requires location: a denied capture shows guidance and never calls start', async () => {
    const user = userEvent.setup();
    mockCaptureRequiredLocation.mockRejectedValue(new Error('denied'));
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);

    await user.click(screen.getByTestId('card-primary-action'));

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith(
        'Location is required to check in. Turn on location access and try again.',
      ),
    );
    expect(mockCheckIn).not.toHaveBeenCalled();
  });

  it('enqueues offline with an offline confirmation', async () => {
    const user = userEvent.setup();
    mockUseIsOnline.mockReturnValue(false);
    mockCheckIn.mockResolvedValue({ startedAt: LOCATION.capturedAt, outOfRadius: false });
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);

    await user.click(screen.getByTestId('card-primary-action'));

    await waitFor(() =>
      expect(mockShowInfo).toHaveBeenCalledWith(
        "You're offline. Check-in saved and will sync automatically.",
      ),
    );
  });
});

describe('AppointmentCard — more actions menu', () => {
  it('offers Running late and Can\'t do for a not-started job today', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    await user.click(screen.getByTestId('card-more-actions'));
    expect(screen.getByRole('menuitem', { name: 'Running late' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: "Can't do this job" })).toBeInTheDocument();
  });

  it('hides Running late when the job is in progress', async () => {
    const user = userEvent.setup();
    mockActions = makeActions('IN_PROGRESS');
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    await user.click(screen.getByTestId('card-more-actions'));
    expect(screen.queryByRole('menuitem', { name: 'Running late' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: "Can't do this job" })).toBeInTheDocument();
  });

  it('opens the Can\'t do sheet from the menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppointmentCard appointment={baseAppointment} today={TODAY} />);
    expect(screen.getByTestId('cant-do-sheet')).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByTestId('card-more-actions'));
    await user.click(screen.getByRole('menuitem', { name: "Can't do this job" }));
    expect(screen.getByTestId('cant-do-sheet')).toHaveAttribute('data-open', 'true');
  });
});
