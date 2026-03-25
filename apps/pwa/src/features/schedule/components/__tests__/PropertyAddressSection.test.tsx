import { render, screen } from '@testing-library/react';
import { PropertyAddressSection } from '../PropertyAddressSection';

describe('PropertyAddressSection', () => {
  it('uses coordinates when they are available, including zero values', () => {
    render(
      <PropertyAddressSection
        address="Equator St"
        latitude={0}
        longitude={0}
      />,
    );

    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
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

    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=123%20Main%20St%2C%20Brisbane',
    );
  });
});
