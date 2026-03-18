import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantPortalInvalidView } from './TenantPortalInvalidView';

describe('TenantPortalInvalidView', () => {
  it('shows the invalid link title', () => {
    render(<TenantPortalInvalidView />);

    expect(
      screen.getByText('This link is no longer valid'),
    ).toBeInTheDocument();
  });

  it('shows the contact agency message', () => {
    render(<TenantPortalInvalidView />);

    expect(
      screen.getByText('Please contact the agency for a new link.'),
    ).toBeInTheDocument();
  });

  it('shows warning icon', () => {
    render(<TenantPortalInvalidView />);

    const icon = document.querySelector('.mdi-alert-outline');
    expect(icon).toBeInTheDocument();
  });

  it('does not show a retry button', () => {
    render(<TenantPortalInvalidView />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not show any appointment details', () => {
    render(<TenantPortalInvalidView />);

    expect(screen.queryByText('Appointment Details')).not.toBeInTheDocument();
  });
});
