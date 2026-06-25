import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FailedUploadsModal } from '../FailedUploadsModal';

describe('FailedUploadsModal', () => {
  const onSkip = vi.fn();
  const onRetry = vi.fn();

  beforeEach(() => {
    onSkip.mockClear();
    onRetry.mockClear();
  });

  it('renders with correct failed count (plural)', () => {
    render(<FailedUploadsModal failedCount={3} onSkip={onSkip} onRetry={onRetry} />);
    expect(screen.getByText('3 photos failed to upload. Proceed without them?')).toBeInTheDocument();
  });

  it('renders with correct failed count (singular)', () => {
    render(<FailedUploadsModal failedCount={1} onSkip={onSkip} onRetry={onRetry} />);
    expect(screen.getByText('1 photo failed to upload. Proceed without it?')).toBeInTheDocument();
  });

  it('calls onRetry when Retry Upload is clicked', async () => {
    const user = userEvent.setup();
    render(<FailedUploadsModal failedCount={2} onSkip={onSkip} onRetry={onRetry} />);
    await user.click(screen.getByTestId('retry-upload-button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('calls onSkip when Skip Photos is clicked', async () => {
    const user = userEvent.setup();
    render(<FailedUploadsModal failedCount={2} onSkip={onSkip} onRetry={onRetry} />);
    await user.click(screen.getByTestId('skip-photos-button'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('has alertdialog role', () => {
    render(<FailedUploadsModal failedCount={1} onSkip={onSkip} onRetry={onRetry} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
