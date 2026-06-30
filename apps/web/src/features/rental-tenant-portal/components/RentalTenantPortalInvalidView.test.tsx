import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RentalTenantPortalInvalidView } from './RentalTenantPortalInvalidView';

describe('RentalTenantPortalInvalidView', () => {
  it('shows the invalid link title', () => {
    render(<RentalTenantPortalInvalidView />);

    expect(
      screen.getByText('This link is no longer valid'),
    ).toBeInTheDocument();
  });

  it('shows the contact agency message', () => {
    render(<RentalTenantPortalInvalidView />);

    expect(
      screen.getByText('Please contact the agency for a new link.'),
    ).toBeInTheDocument();
  });

  it('shows warning icon', () => {
    render(<RentalTenantPortalInvalidView />);

    const icon = document.querySelector('.mdi-alert-outline');
    expect(icon).toBeInTheDocument();
  });

  it('does not show a retry button', () => {
    render(<RentalTenantPortalInvalidView />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not show any appointment details', () => {
    render(<RentalTenantPortalInvalidView />);

    expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
  });
});
