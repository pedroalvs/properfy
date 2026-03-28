import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwUpdatePrompt } from '../SwUpdatePrompt';

const mockUpdateServiceWorker = vi.fn();
let mockNeedRefresh = false;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mockNeedRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: mockUpdateServiceWorker,
  }),
}));

describe('SwUpdatePrompt', () => {
  beforeEach(() => {
    mockNeedRefresh = false;
    mockUpdateServiceWorker.mockClear();
  });

  it('shows update prompt when needRefresh is true', () => {
    mockNeedRefresh = true;
    render(<SwUpdatePrompt />);

    expect(screen.getByTestId('sw-update-prompt')).toBeInTheDocument();
  });

  it('stays hidden when needRefresh is false', () => {
    mockNeedRefresh = false;
    render(<SwUpdatePrompt />);

    expect(screen.queryByTestId('sw-update-prompt')).not.toBeInTheDocument();
  });

  it('calls updateServiceWorker(true) when Update is clicked', async () => {
    mockNeedRefresh = true;
    render(<SwUpdatePrompt />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
  });
});
