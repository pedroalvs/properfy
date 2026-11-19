import { screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { BottomNavBar } from '../BottomNavBar';
import { renderWithProviders } from '@/test-utils';

const { countRef } = vi.hoisted(() => ({ countRef: { value: 0 } }));
vi.mock('@/features/announcements/hooks/useUnreadNoticeCount', () => ({
  useUnreadNoticeCount: () => ({ count: countRef.value }),
}));

describe('BottomNavBar', () => {
  beforeEach(() => {
    countRef.value = 0;
  });

  it('renders the four tabs in order with their destinations', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    expect(screen.getByTestId('nav-today')).toHaveAttribute('href', '/today');
    expect(screen.getByTestId('nav-schedule')).toHaveAttribute('href', '/schedule');
    expect(screen.getByTestId('nav-offers')).toHaveAttribute('href', '/marketplace');
    // More opens the existing profile hub (no rename, no redirect).
    expect(screen.getByTestId('nav-more')).toHaveAttribute('href', '/profile');
    expect(screen.queryByTestId('nav-earnings')).toBeNull();
    expect(screen.queryByTestId('nav-profile')).toBeNull();

    const order = screen.getAllByRole('link').map((l) => l.getAttribute('data-testid'));
    expect(order).toEqual(['nav-today', 'nav-schedule', 'nav-offers', 'nav-more']);
  });

  // The app tour (F04-3b) anchors on these four tabs via `data-tour`.
  it('exposes the data-tour anchors on the four tabs', () => {
    renderWithProviders(<BottomNavBar />);
    for (const key of ['nav-today', 'nav-schedule', 'nav-offers', 'nav-more']) {
      expect(screen.getByTestId(key)).toHaveAttribute('data-tour', key);
    }
  });

  it('renders the labels Today / Schedule / Offers / More', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Offers')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('marks Today active across /today/*', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/today/route'] });
    const today = screen.getByTestId('nav-today');
    expect(today).toHaveAttribute('aria-current', 'page');
    expect(today.className).toContain('text-primary');
    expect(screen.getByTestId('nav-more').getAttribute('aria-current')).toBeNull();
  });

  it.each([
    '/profile',
    '/profile/settings',
    '/profile/announcements/11111111-1111-4111-8111-111111111111',
    '/earnings',
    '/earnings/invoices/22222222-2222-4222-8222-222222222222',
  ])('marks More active (and nothing else) on %s', (path) => {
    renderWithProviders(<BottomNavBar />, { initialEntries: [path] });
    expect(screen.getByTestId('nav-more')).toHaveAttribute('aria-current', 'page');
    for (const other of ['nav-today', 'nav-schedule', 'nav-offers']) {
      expect(screen.getByTestId(other).getAttribute('aria-current')).toBeNull();
    }
  });

  it('keeps the flat active style — colour only, no pill or ring', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/today'] });
    const today = screen.getByTestId('nav-today');
    expect(today.className).toContain('text-primary');
    expect(today.className).not.toMatch(/bg-primary/);
    expect(today.className).not.toMatch(/ring-/);
    expect(today.className).not.toMatch(/rounded/);
  });

  it('shows the faint inactive colour for non-active tabs', () => {
    renderWithProviders(<BottomNavBar />, { initialEntries: ['/today'] });
    const offers = screen.getByTestId('nav-offers');
    expect(offers.className).toContain('text-faint');
    expect(offers.className).not.toContain('text-primary');
  });

  it('has min 44px touch targets', () => {
    renderWithProviders(<BottomNavBar />);
    const today = screen.getByTestId('nav-today');
    expect(today.className).toContain('min-h-touch');
    expect(today.className).toContain('min-w-touch');
  });

  it('keeps the grid-cols-4 clearance layout (nav-clearance contract)', () => {
    renderWithProviders(<BottomNavBar />);
    const row = screen.getByTestId('nav-today').parentElement!;
    expect(row.className).toContain('grid-cols-4');
    expect(row.className).toContain('px-[6px]');
    expect(row.className).toContain('pt-[9px]');
  });

  it('reserves the iOS home-indicator inset below the tabs', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByTestId('bottom-nav').classList.contains('pb-safe-b')).toBe(true);
  });

  it('paints an opaque background with a top border', () => {
    renderWithProviders(<BottomNavBar />);
    const nav = screen.getByTestId('bottom-nav');
    expect(nav.className).not.toContain('backdrop-blur');
    expect(nav.className).toContain('bg-card');
    expect(nav.className).toContain('border-t');
  });

  it('keeps the artboard Schedule and Offers glyphs', () => {
    renderWithProviders(<BottomNavBar />);
    const schedule = screen.getByTestId('nav-schedule').querySelector('svg')!;
    expect(schedule.querySelector('rect[x="3"][y="4"]')).toBeTruthy();
    expect(schedule.querySelector('circle[cx="12"][cy="15"]')).toBeTruthy();
    const offers = screen.getByTestId('nav-offers').querySelector('svg')!;
    expect(offers.querySelector('path[d^="M20.6 13.4"]')).toBeTruthy();
  });

  it('uses the lucide house and ellipsis glyphs for Today and More', () => {
    renderWithProviders(<BottomNavBar />);
    expect(screen.getByTestId('nav-today').querySelector('svg')!.classList.contains('lucide-house')).toBe(true);
    expect(screen.getByTestId('nav-more').querySelector('svg')!.classList.contains('lucide-ellipsis')).toBe(true);
  });

  it('shows an unread badge with the count and an accessible name on the More tab', () => {
    countRef.value = 3;
    renderWithProviders(<BottomNavBar />);
    const more = screen.getByTestId('nav-more');
    expect(more).toHaveAccessibleName('More, 3 unread announcements');
    expect(more.querySelector('span[aria-hidden="true"]')?.textContent).toBe('3');
    // The badge is only on More.
    expect(screen.getByTestId('nav-today').getAttribute('aria-label')).toBeNull();
  });

  it('caps the badge at "9+" above nine unread', () => {
    countRef.value = 12;
    renderWithProviders(<BottomNavBar />);
    const more = screen.getByTestId('nav-more');
    expect(more).toHaveAccessibleName('More, 12 unread announcements');
    expect(more.textContent).toContain('9+');
  });

  it('shows no badge and no unread accessible name when the count is zero', () => {
    countRef.value = 0;
    renderWithProviders(<BottomNavBar />);
    const more = screen.getByTestId('nav-more');
    expect(more.getAttribute('aria-label')).toBeNull();
    expect(more.textContent).not.toContain('9+');
  });
});
