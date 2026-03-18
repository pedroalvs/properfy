import { screen } from '@testing-library/react';
import { OfflineMarketplaceBanner } from '../OfflineMarketplaceBanner';
import { renderWithProviders } from '@/test-utils';

describe('OfflineMarketplaceBanner', () => {
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
    renderWithProviders(<OfflineMarketplaceBanner />);
    expect(screen.getByTestId('offline-marketplace-banner')).toBeInTheDocument();
    expect(screen.getByText('Marketplace requires internet')).toBeInTheDocument();
  });

  it('hides banner when online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    renderWithProviders(<OfflineMarketplaceBanner />);
    expect(screen.queryByTestId('offline-marketplace-banner')).not.toBeInTheDocument();
  });
});
