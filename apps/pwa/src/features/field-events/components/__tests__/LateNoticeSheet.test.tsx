import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@properfy/shared';
import { LateNoticeSheet } from '../LateNoticeSheet';

const mockMutateAsync = vi.fn();
const mockUseIsOnline = vi.fn();
const mockShowSuccess = vi.fn();
const mockCaptureLocation = vi.fn();

vi.mock('../../hooks/useReportLateNotice', () => ({
  useReportLateNotice: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
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
  generateIdempotencyKey: () => 'idem-late',
}));

function renderSheet(props: Partial<Parameters<typeof LateNoticeSheet>[0]> = {}) {
  return render(
    <LateNoticeSheet
      open
      onOpenChange={props.onOpenChange ?? vi.fn()}
      appointmentId="apt-1"
      appointmentCode="INS-0001"
      propertyAddress="123 Main St"
      timeSlotStart={props.timeSlotStart ?? '09:00'}
      publishedServiceStartAt={props.publishedServiceStartAt}
    />,
  );
}

describe('LateNoticeSheet', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue({
      estimatedArrivalAt: '2026-11-03T09:20:00.000+11:00',
      minutesLate: 20,
    });
    mockUseIsOnline.mockReset().mockReturnValue(true);
    mockShowSuccess.mockReset();
    mockCaptureLocation.mockReset().mockResolvedValue(null);
  });

  it('offers four reasons, the minutes chips and no note field', () => {
    renderSheet();
    expect(screen.getAllByRole('radio')).toHaveLength(4 + 6); // 4 reason radios + 6 minute chips
    expect(screen.getByLabelText('20 minutes late')).toBeInTheDocument();
    expect(screen.getByLabelText('90 minutes late')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('asks to count from the booked window start when there is no published stop', () => {
    renderSheet({ timeSlotStart: '09:00' });
    expect(screen.getByText('How late will you arrive? (from 09:00)')).toBeInTheDocument();
    expect(screen.getByText('Count from the start of the booked window.')).toBeInTheDocument();
  });

  it('asks to count from the published plan time when a stop is published', () => {
    renderSheet({ publishedServiceStartAt: '2026-11-03T10:15:00.000+11:00' });
    expect(screen.getByText('How late will you arrive? (from 10:15)')).toBeInTheDocument();
    expect(screen.getByText('Count from your planned arrival time.')).toBeInTheDocument();
  });

  it('posts the reason and minutes and confirms with the server ETA; a double tap sends once', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByLabelText('Traffic'));
    await user.click(screen.getByLabelText('20 minutes late'));
    const send = screen.getByTestId('late-notice-send');
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: { reason: 'TRAFFIC', minutesLate: 20 },
      idempotencyKey: 'idem-late',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockShowSuccess).toHaveBeenCalledWith(
      "Operations know you'll arrive around 09:20 (about 20 min late).",
    );
  });

  it('shows the server message when the inspector has already checked in (422)', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new ApiError(422, "You've already checked in to this job.", 'LATE_NOTICE_ALREADY_STARTED'));
    renderSheet();

    await user.click(screen.getByLabelText('Traffic'));
    await user.click(screen.getByLabelText('20 minutes late'));
    await user.click(screen.getByTestId('late-notice-send'));

    await waitFor(() =>
      expect(screen.getByTestId('late-notice-error')).toHaveTextContent(
        "You've already checked in to this job.",
      ),
    );
  });

  it('disables the submit and shows the connection alert when offline', () => {
    mockUseIsOnline.mockReturnValue(false);
    renderSheet();
    expect(screen.getByTestId('late-notice-offline')).toBeInTheDocument();
    expect(screen.getByTestId('late-notice-send')).toBeDisabled();
  });
});
