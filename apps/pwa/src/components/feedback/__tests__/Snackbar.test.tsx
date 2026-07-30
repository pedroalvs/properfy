import { render, screen } from '@testing-library/react';
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

  it('sits above the bottom nav including its home-indicator inset', () => {
    // The nav pads itself with env(safe-area-inset-bottom), so a fixed 80px offset would
    // put the toast *behind* the tabs on a notched iPhone. The offset has to track the
    // same inset the nav uses.
    render(<Snackbar />);
    expect(screen.getByTestId('snackbar-container').className).toContain('bottom-nav-clear');
  });
});
