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
