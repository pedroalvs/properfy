import { render, screen } from '@testing-library/react';
import { PropertyAddressSection } from '../PropertyAddressSection';

describe('PropertyAddressSection', () => {
  it('uses coordinates when they are available, including zero values', () => {
    render(
      <PropertyAddressSection
        address="Equator St"
        suburb=""
        latitude={0}
        longitude={0}
      />,
    );

    expect(screen.getByRole('link', { name: /navigate to property/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=0,0',
    );
  });

  it('falls back to address query when coordinates are missing', () => {
    render(
      <PropertyAddressSection
        address="123 Main St, Brisbane"
        latitude={null}
        longitude={null}
      />,
    );

    expect(screen.getByRole('link', { name: /navigate to property/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=123%20Main%20St%2C%20Brisbane',
    );
  });

  it('shows property detail chips when attributes are provided', () => {
    render(
      <PropertyAddressSection
        address="123 King St"
        suburb="Sydney"
        latitude={null}
        longitude={null}
        propertyType="APARTMENT"
        privateAreaM2={72}
        totalAreaM2={90}
        furnished={true}
        linenProvided={false}
      />,
    );
    expect(screen.getByTestId('property-detail-chips')).toBeInTheDocument();
    expect(screen.getByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText('Private 72 m²')).toBeInTheDocument();
    expect(screen.getByText('Total 90 m²')).toBeInTheDocument();
    expect(screen.getByText('Furnished')).toBeInTheDocument();
    expect(screen.getByText('No linen')).toBeInTheDocument();
  });

  it('hides detail chips when no attributes are provided', () => {
    render(
      <PropertyAddressSection address="123 King St" latitude={null} longitude={null} />,
    );
    expect(screen.queryByTestId('property-detail-chips')).not.toBeInTheDocument();
  });

  it('shows suburb when provided', () => {
    render(
      <PropertyAddressSection
        address="123 King St"
        suburb="Sydney"
        latitude={null}
        longitude={null}
      />,
    );
    expect(screen.getByText('Sydney')).toBeInTheDocument();
  });
});
