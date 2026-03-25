import { render, screen } from '@testing-library/react';
import { TenantContactSection } from '../TenantContactSection';

describe('TenantContactSection', () => {
  it('renders phone and email links when available', () => {
    render(
      <TenantContactSection
        name="Jane Tenant"
        phone="+61400000000"
        email="jane@example.com"
      />,
    );

    expect(screen.getByRole('link', { name: /\+61400000000/i })).toHaveAttribute(
      'href',
      'tel:+61400000000',
    );
    expect(screen.getByRole('link', { name: /jane@example.com/i })).toHaveAttribute(
      'href',
      'mailto:jane@example.com',
    );
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
});
