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
});
