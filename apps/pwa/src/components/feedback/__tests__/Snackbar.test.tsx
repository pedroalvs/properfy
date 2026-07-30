import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Snackbar } from '../Snackbar';

const dismiss = vi.fn();
let mockMessages: Array<{ id: string; type: string; message: string }> = [];

// SnackbarProvider does not render the toast DOM itself, so the component under test
// only shows up when useSnackbar is mocked with messages.
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ messages: mockMessages, dismiss }),
}));

describe('Snackbar', () => {
  beforeEach(() => {
    dismiss.mockClear();
    mockMessages = [{ id: '1', type: 'info', message: 'Synced' }];
  });

  it('renders queued messages', () => {
    render(<Snackbar />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('dismisses a message', async () => {
    const user = userEvent.setup();
    render(<Snackbar />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalledWith('1');
  });

  it('sits above the bottom nav including its home-indicator inset', () => {
    // The nav pads itself with env(safe-area-inset-bottom), so a fixed 80px offset would
    // overlap the taller bar. The toast is z-[100] against the nav's z-50, so it would
    // paint over the tabs rather than hide behind them — the offset has to track the same
    // inset the nav uses.
    render(<Snackbar />);
    expect(screen.getByTestId('snackbar-container').classList.contains('bottom-nav-clear')).toBe(true);
  });
});
