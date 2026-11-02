import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@properfy/shared';
import { CantDoSheet } from '../CantDoSheet';

const mockMutateAsync = vi.fn();
const mockUseIsOnline = vi.fn();
const mockShowSuccess = vi.fn();
const mockCaptureLocation = vi.fn();

vi.mock('../../hooks/useReportCantDo', () => ({
  useReportCantDo: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: vi.fn(), showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));
vi.mock('../../lib/optional-location', () => ({
  captureOptionalLocation: (...args: unknown[]) => mockCaptureLocation(...args),
}));
vi.mock('@/lib/idempotency', () => ({
  generateIdempotencyKey: () => 'idem-fixed',
}));

function renderSheet(props: Partial<Parameters<typeof CantDoSheet>[0]> = {}) {
  return render(
    <CantDoSheet
      open
      onOpenChange={props.onOpenChange ?? vi.fn()}
      appointmentId="apt-1"
      appointmentCode="INS-0001"
      propertyAddress="123 Main St"
      onReported={props.onReported}
    />,
  );
}

describe('CantDoSheet', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
    mockUseIsOnline.mockReset().mockReturnValue(true);
    mockShowSuccess.mockReset();
    mockCaptureLocation.mockReset().mockResolvedValue(null);
  });

  it('lists the six reasons as radios in a group labelled Reason', () => {
    renderSheet();
    const group = screen.getByRole('group', { name: 'Reason' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByLabelText("Key didn't work")).toBeInTheDocument();
  });

  it('disables Send until a reason is chosen', () => {
    renderSheet();
    expect(screen.getByTestId('cant-do-send')).toBeDisabled();
  });

  it('requires a note for SITE_ISSUE with a help message', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByLabelText('Problem at the property'));
    expect(screen.getByTestId('cant-do-send')).toBeDisabled();
    expect(screen.getByText('Add a short note for this reason')).toBeInTheDocument();
  });

  it('shows a 0/500 counter', () => {
    renderSheet();
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });

  it('shows the shared-with-agency hint', () => {
    renderSheet();
    expect(screen.getByText('This note is shared with the agency.')).toBeInTheDocument();
  });

  it('disables Send and shows the connection alert when offline', () => {
    mockUseIsOnline.mockReturnValue(false);
    renderSheet();
    expect(screen.getByTestId('cant-do-offline')).toBeInTheDocument();
    expect(screen.getByTestId('cant-do-send')).toBeDisabled();
  });

  it('posts reason, note, position and the stable idempotency key; a double tap sends once', async () => {
    const user = userEvent.setup();
    mockCaptureLocation.mockResolvedValue({
      latitude: -33.8,
      longitude: 151.2,
      accuracy: 9,
      clientOccurredAt: '2026-11-03T09:41:00.000Z',
    });
    const onOpenChange = vi.fn();
    const onReported = vi.fn();
    renderSheet({ onOpenChange, onReported });

    await user.click(screen.getByLabelText("Key didn't work"));
    const send = screen.getByTestId('cant-do-send');
    // Two synchronous taps in the same tick: the submittingRef guard must collapse
    // them to a single POST (isPending only flips on the next render).
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: {
        reason: 'KEY_FAILED',
        note: undefined,
        latitude: -33.8,
        longitude: 151.2,
        accuracy: 9,
        clientOccurredAt: '2026-11-03T09:41:00.000Z',
      },
      idempotencyKey: 'idem-fixed',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Sent to operations. This job has been removed from your route.',
    );
    expect(onReported).toHaveBeenCalled();
  });

  it('sends without a position when none is available', async () => {
    const user = userEvent.setup();
    mockCaptureLocation.mockResolvedValue(null);
    renderSheet();

    await user.click(screen.getByLabelText('No answer at the door'));
    await user.click(screen.getByTestId('cant-do-send'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: { reason: 'NO_ANSWER', note: undefined },
      idempotencyKey: 'idem-fixed',
    });
  });

  it('shows the server message on a 4xx error and stays open', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new ApiError(404, 'This appointment is no longer assigned to you.', 'APPOINTMENT_NOT_FOUND'));
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByLabelText("Key didn't work"));
    await user.click(screen.getByTestId('cant-do-send'));

    await waitFor(() =>
      expect(screen.getByTestId('cant-do-error')).toHaveTextContent(
        'This appointment is no longer assigned to you.',
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows a generic retry message on a 5xx/network error', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new ApiError(0, 'network', 'NETWORK_ERROR'));
    renderSheet();

    await user.click(screen.getByLabelText("Key didn't work"));
    await user.click(screen.getByTestId('cant-do-send'));

    await waitFor(() =>
      expect(screen.getByTestId('cant-do-error')).toHaveTextContent(
        "Couldn't send. Check your connection and try again.",
      ),
    );
  });
});
