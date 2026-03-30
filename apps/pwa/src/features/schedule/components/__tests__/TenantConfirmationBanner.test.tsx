import { render, screen } from '@testing-library/react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { TenantConfirmationBanner } from '../TenantConfirmationBanner';

describe('TenantConfirmationBanner', () => {
  it('renders confirmed status', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.CONFIRMED} />);
    expect(screen.getByTestId('tenant-confirmation-banner')).toBeInTheDocument();
    expect(screen.getByText('Tenant confirmed')).toBeInTheDocument();
  });

  it('renders pending status', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.PENDING} />);
    expect(screen.getByText('Awaiting confirmation')).toBeInTheDocument();
  });

  it('renders unavailable status', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.UNAVAILABLE} />);
    expect(screen.getByText('Tenant unavailable')).toBeInTheDocument();
  });

  it('renders no response status', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.NO_RESPONSE} />);
    expect(screen.getByText('No response')).toBeInTheDocument();
  });

  it('has role="status"', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.CONFIRMED} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies success styling for confirmed', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.CONFIRMED} />);
    const banner = screen.getByTestId('tenant-confirmation-banner');
    expect(banner.className).toContain('bg-success/8');
  });

  it('applies error styling for unavailable', () => {
    render(<TenantConfirmationBanner status={TenantConfirmationStatus.UNAVAILABLE} />);
    const banner = screen.getByTestId('tenant-confirmation-banner');
    expect(banner.className).toContain('bg-error/8');
  });
});
