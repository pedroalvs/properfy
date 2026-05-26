import { render, screen } from '@testing-library/react';
import { JobDetailsSection } from '../JobDetailsSection';
import type { JobDetails } from '../../types';

const baseJobDetails: JobDetails = {
  agency: { id: 'tenant-1', name: 'Alpha Realty' },
  tenantContacts: [
    { name: 'John Smith', email: 'john@example.com', phone: '+61400000000', role: 'TENANT', isPrimary: true },
  ],
  keys: { keyRequired: false, keyLocation: null },
  keyLocation: undefined,
  propertyManager: null,
  payment: { payoutAmount: 8500, currency: 'AUD' },
  inspectionAppLink: undefined,
};

describe('JobDetailsSection', () => {
  it('renders agency name from agency.name field', () => {
    render(<JobDetailsSection jobDetails={baseJobDetails} />);
    expect(screen.getByText('Alpha Realty')).toBeInTheDocument();
  });

  it('does not show keys section when keys.keyRequired is false', () => {
    render(<JobDetailsSection jobDetails={baseJobDetails} />);
    expect(screen.queryByTestId('job-keys-section')).not.toBeInTheDocument();
  });

  it('shows keys section and location when keys.keyRequired is true', () => {
    const withKey: JobDetails = {
      ...baseJobDetails,
      keys: { keyRequired: true, keyLocation: 'Under the mat' },
    };
    render(<JobDetailsSection jobDetails={withKey} />);
    expect(screen.getByTestId('job-keys-section')).toBeInTheDocument();
    expect(screen.getByText('Under the mat')).toBeInTheDocument();
  });

  it('shows map link from keyLocation.mapLinkUrl when present', () => {
    const withMapLink: JobDetails = {
      ...baseJobDetails,
      keys: { keyRequired: true, keyLocation: 'Under the mat' },
      keyLocation: { address: '42 Wallaby Way', mapLinkUrl: 'https://maps.example.com/42' },
    };
    render(<JobDetailsSection jobDetails={withMapLink} />);
    expect(screen.getByTestId('key-location-map-link')).toHaveAttribute('href', 'https://maps.example.com/42');
  });

  it('formats payout amount from payment.payoutAmount', () => {
    render(<JobDetailsSection jobDetails={baseJobDetails} />);
    expect(screen.getByTestId('job-payment-section')).toBeInTheDocument();
    expect(screen.getByText(/\$8,500\.00/)).toBeInTheDocument();
  });

  it('renders tenant contact with name and email link', () => {
    render(<JobDetailsSection jobDetails={baseJobDetails} />);
    expect(screen.getByTestId('job-tenant-contacts')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByTestId('tenant-contact-email-0')).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('shows inspection app link when present', () => {
    const withLink: JobDetails = {
      ...baseJobDetails,
      inspectionAppLink: { url: 'https://app.inspect.com/session/abc', label: 'Open Inspection App' },
    };
    render(<JobDetailsSection jobDetails={withLink} />);
    expect(screen.getByTestId('inspection-app-link')).toHaveAttribute('href', 'https://app.inspect.com/session/abc');
    expect(screen.getByText('Open Inspection App')).toBeInTheDocument();
  });

  it('does not show agency section when agency is absent', () => {
    // agency is always present in the schema — this tests graceful null guard in case data is partial
    const noAgencyJobDetails = {
      ...baseJobDetails,
      agency: null as unknown as JobDetails['agency'],
    };
    render(<JobDetailsSection jobDetails={noAgencyJobDetails} />);
    expect(screen.queryByText('Agency')).not.toBeInTheDocument();
  });
});
