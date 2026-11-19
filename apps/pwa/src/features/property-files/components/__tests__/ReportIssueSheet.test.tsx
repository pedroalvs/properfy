import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { ReportIssueSheet } from '../ReportIssueSheet';

interface UploadState {
  photos: unknown[];
  addError: string | null;
  addPhoto: () => void;
  retryPhoto: () => void;
  removePhoto: () => void;
  reset: () => void;
  isUploading: boolean;
  hasFailed: boolean;
  confirmedFileIds: string[];
}

let uploadState: UploadState;
const mockMutateAsync = vi.fn();
const mockShowSuccess = vi.fn();
let online = true;

vi.mock('../../hooks/useIssuePhotoUpload', () => ({ useIssuePhotoUpload: () => uploadState }));
vi.mock('../../hooks/useCreatePropertyIssue', () => ({
  useCreatePropertyIssue: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => online }));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: vi.fn(), showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));
vi.mock('@/lib/idempotency', () => ({ generateIdempotencyKey: () => 'idem-fixed' }));

function baseUpload(over: Partial<UploadState> = {}): UploadState {
  return {
    photos: [],
    addError: null,
    addPhoto: vi.fn(),
    retryPhoto: vi.fn(),
    removePhoto: vi.fn(),
    reset: vi.fn(),
    isUploading: false,
    hasFailed: false,
    confirmedFileIds: [],
    ...over,
  };
}

function renderSheet() {
  return render(
    <ReportIssueSheet
      open
      onOpenChange={vi.fn()}
      appointmentId="apt-1"
      propertyId="p1"
      propertyAddress="123 Main St"
    />,
  );
}

describe('ReportIssueSheet', () => {
  beforeEach(() => {
    uploadState = baseUpload();
    mockMutateAsync.mockReset().mockResolvedValue({ id: 'issue-1' });
    mockShowSuccess.mockReset();
    online = true;
  });

  it('disables submit until a reason is entered', async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByTestId('report-issue-submit')).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Broken window');
    expect(screen.getByTestId('report-issue-submit')).toBeEnabled();
  });

  it('creates the issue with the reason, confirmed photos and an idempotency key', async () => {
    uploadState = baseUpload({ confirmedFileIds: ['f1', 'f2'] });
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('Reason'), 'Broken window');
    await user.click(screen.getByTestId('report-issue-submit'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: { propertyId: 'p1', appointmentId: 'apt-1', reason: 'Broken window', photoFileIds: ['f1', 'f2'] },
      idempotencyKey: 'idem-fixed',
    });
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('creates a zero-photo issue (no photoFileIds key)', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('Reason'), 'No access');
    await user.click(screen.getByTestId('report-issue-submit'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: { propertyId: 'p1', appointmentId: 'apt-1', reason: 'No access' },
      idempotencyKey: 'idem-fixed',
    });
  });

  it('blocks submit while a photo is uploading or has failed', async () => {
    uploadState = baseUpload({ isUploading: true });
    const { rerender } = renderSheet();
    await userEvent.setup().type(screen.getByLabelText('Reason'), 'x');
    expect(screen.getByTestId('report-issue-submit')).toBeDisabled();

    uploadState = baseUpload({ hasFailed: true });
    rerender(
      <ReportIssueSheet open onOpenChange={vi.fn()} appointmentId="apt-1" propertyId="p1" propertyAddress="123 Main St" />,
    );
    expect(screen.getByTestId('report-issue-submit')).toBeDisabled();
  });

  it('shows the storage-unavailable message on a 503', async () => {
    mockMutateAsync.mockRejectedValue(new ApiError(503, 'x', 'FILE_STORAGE_UNAVAILABLE'));
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('Reason'), 'Broken window');
    await user.click(screen.getByTestId('report-issue-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('report-issue-error')).toHaveTextContent(FILE_STORAGE_UNAVAILABLE_MESSAGE),
    );
  });

  it('is unavailable offline', () => {
    online = false;
    renderSheet();
    expect(screen.getByTestId('report-issue-offline')).toBeInTheDocument();
    expect(screen.getByTestId('report-issue-submit')).toBeDisabled();
  });
});
