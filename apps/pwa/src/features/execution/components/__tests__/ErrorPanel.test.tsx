import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorPanel } from '../ErrorPanel';

describe('ErrorPanel', () => {
  const onRetry = vi.fn();
  const onSaveExit = vi.fn();

  beforeEach(() => {
    onRetry.mockClear();
    onSaveExit.mockClear();
  });

  it('renders error message', () => {
    render(<ErrorPanel message="Network error" onRetry={onRetry} onSaveExit={onSaveExit} />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Submission Failed')).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', async () => {
    const user = userEvent.setup();
    render(<ErrorPanel message="Error" onRetry={onRetry} onSaveExit={onSaveExit} />);
    await user.click(screen.getByTestId('retry-button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('calls onSaveExit when save & exit clicked', async () => {
    const user = userEvent.setup();
    render(<ErrorPanel message="Error" onRetry={onRetry} onSaveExit={onSaveExit} />);
    await user.click(screen.getByTestId('save-exit-button'));
    expect(onSaveExit).toHaveBeenCalledOnce();
  });
});
