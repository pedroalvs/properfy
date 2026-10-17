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

let mockIsOnline = true;
vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockIsOnline,
}));

describe('TopBar', () => {
  let historyStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockQueuedCount = 0;
    mockIsOnline = true;
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

  it('keeps the back button visible at all widths by default', () => {
    renderWithProviders(<TopBar title="Detail" showBack />);
    expect(screen.getByTestId('back-button').className).not.toContain('md:hidden');
  });

  it('hides the back button at the tablet breakpoint when backHideOnWide is set', () => {
    // In a 2-column pane the master list is always visible, so "back" is redundant on
    // tablet — but the phone stack still needs it (no md:hidden collapse on phone).
    renderWithProviders(<TopBar title="Detail" showBack backHideOnWide />);
    expect(screen.getByTestId('back-button').className).toContain('md:hidden');
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

  it('hides the connection indicator when online (v3 has no persistent pill)', () => {
    mockIsOnline = true;
    renderWithProviders(<TopBar title="Schedule" />);
    expect(screen.queryByTestId('connection-indicator')).not.toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });

  it('shows a dot-only Offline indicator (no text) when offline', () => {
    mockIsOnline = false;
    renderWithProviders(<TopBar title="Schedule" />);
    const indicator = screen.getByTestId('connection-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('bg-destructive');
    // PWA-12: the TopBar keeps the dot but no longer repeats the "offline" wording;
    // the a11y name carries it instead (the banners carry the visible copy).
    expect(indicator).toHaveAccessibleName('Offline');
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('renders the lg primary-tab title at the .pf-h1 scale (27px / -0.4px tracking)', () => {
    renderWithProviders(<TopBar title="Schedule" size="lg" />);
    const title = screen.getByText('Schedule');
    expect(title.className).toContain('text-[27px]');
    expect(title.className).toContain('tracking-[-0.4px]');
    expect(title.className).toContain('font-extrabold');
  });

  it('keeps the sub-page title at the smaller .pf-h2 scale (text-xl)', () => {
    renderWithProviders(<TopBar title="Inspection" />);
    const title = screen.getByText('Inspection');
    expect(title.className).toContain('text-xl');
    expect(title.className).not.toContain('text-[27px]');
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

  it('paints an opaque background instead of a backdrop filter', () => {
    // Same reasoning as BottomNavBar: an opaque background keeps the header off its own
    // composited layer. `backdrop-filter`/translucency would promote one, which WebKit
    // can mispaint while scrolling — kept defensive even though v3 drops `sticky`.
    const { container } = renderWithProviders(<TopBar title="Schedule" />);
    const header = container.querySelector('header')!;
    expect(header.className).not.toContain('backdrop-blur');
    expect(header.className).not.toMatch(/bg-white\/\d+/);
    expect(header.className).toContain('bg-background');
  });
});
