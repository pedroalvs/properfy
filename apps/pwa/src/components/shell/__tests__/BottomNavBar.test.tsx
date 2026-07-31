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

  it('tints the active tab', () => {
    // Link one of two: the class is used. On its own this proves nothing — it passed
    // throughout the months `bg-primary/10` compiled to an empty stylesheet, because the
    // tokens are `var(--color-X)` holding a hex and Tailwind drops the whole utility
    // (#1041). Link two is `src/__tests__/tailwind-emission.test.ts`, which asserts this
    // exact class compiles to a real `background-color`.
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/schedule'] });
    const scheduleTab = screen.getByTestId('nav-schedule');
    expect(scheduleTab.className).toContain('bg-primary/10');
  });

  it('shows inactive color for non-active tabs', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/schedule'] });
    const offersTab = screen.getByTestId('nav-offers');
    expect(offersTab.className).toContain('text-text-muted');
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
    expect(nav.className).toContain('bg-card-bg');
  });

  it('does not reference spacing classes that Tailwind never defined', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByTestId('bottom-nav').innerHTML).not.toContain('h-18');
  });
});
