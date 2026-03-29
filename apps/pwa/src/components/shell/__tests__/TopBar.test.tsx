import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from '../TopBar';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockQueuedCount = 0;
vi.mock('@/features/execution/hooks/useQueuedActionCount', () => ({
  useQueuedActionCount: () => mockQueuedCount,
}));

describe('TopBar', () => {
  let historyStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockQueuedCount = 0;
    historyStateSpy = vi.spyOn(window.history, 'state', 'get');
    historyStateSpy.mockReturnValue({ idx: 1 });
  });

  afterEach(() => {
    historyStateSpy.mockRestore();
  });

  it('renders title', () => {
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('does not show back button by default', () => {
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('shows back button when showBack is true', () => {
    renderWithProviders(<TopBar title="Detail" showBack />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
  });

  it('navigates back when back button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopBar title="Detail" showBack />);
    await user.click(screen.getByTestId('back-button'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('falls back to /schedule on direct entry with no in-app history', async () => {
    historyStateSpy.mockReturnValue({ idx: 0 });
    const user = userEvent.setup();

    renderWithProviders(<TopBar title="Detail" showBack />);
    await user.click(screen.getByTestId('back-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/schedule', { replace: true });
  });

  it('shows connection indicator', () => {
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.getByTestId('connection-indicator')).toBeInTheDocument();
  });

  it('shows green indicator when online', () => {
    renderWithProviders(<TopBar title="Schedule" />);
    const indicator = screen.getByTestId('connection-indicator');
    expect(indicator.className).toContain('bg-success');
  });

  it('does not show subtitle when not provided', () => {
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.queryByTestId('topbar-subtitle')).not.toBeInTheDocument();
  });

  it('shows subtitle when provided', () => {
    renderWithProviders(<TopBar title="Inspection" subtitle="123 Main St · 9:00 AM" />);
    expect(screen.getByTestId('topbar-subtitle')).toHaveTextContent('123 Main St · 9:00 AM');
  });

  it('does not show queue badge when count is 0', () => {
    mockQueuedCount = 0;
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.queryByTestId('queue-badge')).not.toBeInTheDocument();
  });

  it('shows queue badge with count when there are queued actions', () => {
    mockQueuedCount = 3;
    renderWithProviders(<TopBar title="Schedule" />);
    const badge = screen.getByTestId('queue-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3 pending');
  });
});
