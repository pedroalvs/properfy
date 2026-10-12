import { screen } from '@testing-library/react';
import { BottomNavBar } from '../BottomNavBar';
import { renderWithProviders } from '@/test-utils';

describe('BottomNavBar', () => {
  it('renders 4 navigation tabs', () => {
    renderWithProviders(<BottomNavBar />);
    const nav = screen.getByTestId('bottom-nav');
    expect(nav).toBeInTheDocument();
    expect(screen.getByTestId('nav-schedule')).toBeInTheDocument();
    expect(screen.getByTestId('nav-offers')).toBeInTheDocument();
    expect(screen.getByTestId('nav-earnings')).toBeInTheDocument();
    expect(screen.getByTestId('nav-profile')).toBeInTheDocument();
  });

  it('highlights active tab', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/schedule'] });
    const scheduleTab = screen.getByTestId('nav-schedule');
    expect(scheduleTab.className).toContain('text-primary');
  });

  it('renders the active tab flat — colour only, no pill or ring (v3 .pf-navb--on)', () => {
    // The v3 footer tabs are borderless: the active tab is distinguished by the blue
    // colour alone (`.pf-navb--on{color:var(--pf-blue)}`), with no filled background,
    // inset ring, or rounded pill. An earlier impl wrapped it in `bg-primary/10` +
    // `ring-primary/20` + `rounded-2xl`; this locks the flat artboard design instead.
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/schedule'] });
    const scheduleTab = screen.getByTestId('nav-schedule');
    expect(scheduleTab.className).toContain('text-primary');
    expect(scheduleTab.className).not.toMatch(/bg-primary/);
    expect(scheduleTab.className).not.toMatch(/ring-/);
    expect(scheduleTab.className).not.toMatch(/rounded/);
  });

  it('shows the faint inactive colour for non-active tabs (v3 --pf-faint)', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/schedule'] });
    const offersTab = screen.getByTestId('nav-offers');
    expect(offersTab.className).toContain('text-faint');
    expect(offersTab.className).not.toContain('text-primary');
  });

  it('has min 44px touch targets', () => {
    renderWithProviders(<BottomNavBar />);
    const scheduleTab = screen.getByTestId('nav-schedule');
    expect(scheduleTab.className).toContain('min-h-touch');
    expect(scheduleTab.className).toContain('min-w-touch');
  });

  it('renders correct labels', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Offers')).toBeInTheDocument();
    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('uses the .pf-nav inner padding (6px sides, 9px top; bottom from pb-safe-b)', () => {
    renderWithProviders(<BottomNavBar />);
    const row = screen.getByTestId('nav-schedule').parentElement!;
    expect(row.className).toContain('px-[6px]');
    expect(row.className).toContain('pt-[9px]');
    // The 22px artboard bottom padding is replaced by the safe-area inset on the nav.
    expect(row.className).not.toContain('py-2');
  });

  it('reserves the iOS home-indicator inset below the tabs', () => {
    // Measured on a 393x852 iPhone viewport: without this padding the tab labels sit
    // 8-32px from the screen edge, entirely inside the ~34px home-indicator strip, and
    // most of each tap target overlaps the system swipe-up gesture area.
    renderWithProviders(<BottomNavBar />);
    // classList, not a substring check: `pb-safe-b-6` would satisfy `toContain`.
    expect(screen.getByTestId('bottom-nav').classList.contains('pb-safe-b')).toBe(true);
  });

  it('paints an opaque background instead of a backdrop filter', () => {
    // `backdrop-filter` on a position:fixed element forces a separate composited layer,
    // which WebKit can mispaint at a stale offset during momentum scrolling. That is the
    // leading suspect for a field report of this bar rendering mid-screen on iOS, not a
    // confirmed diagnosis — it does not reproduce in Chrome.
    renderWithProviders(<BottomNavBar />);
    const nav = screen.getByTestId('bottom-nav');
    expect(nav.className).not.toContain('backdrop-blur');
    expect(nav.className).not.toMatch(/bg-white\/\d+/);
    expect(nav.className).toContain('bg-card');
  });

  it('does not reference spacing classes that Tailwind never defined', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByTestId('bottom-nav').innerHTML).not.toContain('h-18');
  });
});
