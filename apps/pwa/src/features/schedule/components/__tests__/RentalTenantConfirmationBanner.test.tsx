import { render, screen } from '@testing-library/react';
import { RentalTenantConfirmationStatus } from '@properfy/shared';
import { RentalTenantConfirmationBanner } from '../RentalTenantConfirmationBanner';

describe('RentalTenantConfirmationBanner', () => {
  it('renders confirmed status', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.CONFIRMED} />);
    expect(screen.getByTestId('tenant-confirmation-banner')).toBeInTheDocument();
    expect(screen.getByText('Tenant confirmed')).toBeInTheDocument();
  });

  it('renders pending status', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.PENDING} />);
    expect(screen.getByText('Awaiting confirmation')).toBeInTheDocument();
  });

  it('renders unavailable status', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.UNAVAILABLE} />);
    expect(screen.getByText('Tenant unavailable')).toBeInTheDocument();
  });

  it('renders no response status', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.NO_RESPONSE} />);
    expect(screen.getByText('No response')).toBeInTheDocument();
  });

  it('has role="status"', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.CONFIRMED} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies success styling for confirmed', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.CONFIRMED} />);
    const banner = screen.getByTestId('tenant-confirmation-banner');
    expect(banner.className).toContain('bg-success/8');
  });

  it('applies error styling for unavailable', () => {
    render(<RentalTenantConfirmationBanner status={RentalTenantConfirmationStatus.UNAVAILABLE} />);
    const banner = screen.getByTestId('tenant-confirmation-banner');
    expect(banner.className).toContain('bg-error/8');
  });
});
