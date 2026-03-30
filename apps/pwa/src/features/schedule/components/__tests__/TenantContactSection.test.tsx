import { render, screen } from '@testing-library/react';
import { TenantContactSection } from '../TenantContactSection';

describe('TenantContactSection', () => {
  it('renders phone link with correct href', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone="+61400000000"
        email={null}
      />,
    );
    expect(screen.getByTestId('tenant-phone-link')).toHaveAttribute('href', 'tel:+61400000000');
  });

  it('renders email link with correct href', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone={null}
        email="jane@example.com"
      />,
    );
    expect(screen.getByTestId('tenant-email-link')).toHaveAttribute('href', 'mailto:jane@example.com');
  });

  it('renders both phone and email links when available', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone="+61400000000"
        email="jane@example.com"
      />,
    );
    expect(screen.getByTestId('tenant-phone-link')).toBeInTheDocument();
    expect(screen.getByTestId('tenant-email-link')).toBeInTheDocument();
  });

  it('shows an explicit fallback when there are no contact details', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone={null}
        email={null}
      />,
    );
    expect(screen.getByText('No contact details available.')).toBeInTheDocument();
  });

  it('shows tenant name', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone={null}
        email={null}
      />,
    );
    expect(screen.getByText('Jane Tenant')).toBeInTheDocument();
  });
});
