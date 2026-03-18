import { screen } from '@testing-library/react';
import { OfflineBanner } from '../OfflineBanner';
import { renderWithProviders } from '@/test-utils';

describe('OfflineBanner', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it('shows banner when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderWithProviders(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
    expect(screen.getByText('You are offline')).toBeInTheDocument();
  });

  it('hides banner when online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderWithProviders(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
