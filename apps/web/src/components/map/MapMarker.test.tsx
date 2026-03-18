import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapMarker } from './MapMarker';

describe('MapMarker', () => {
  it('renders marker with coordinates', () => {
    render(<MapMarker longitude={151.2093} latitude={-33.8688} />);
    const marker = screen.getByTestId('map-marker');
    expect(marker).toHaveAttribute('data-longitude', '151.2093');
    expect(marker).toHaveAttribute('data-latitude', '-33.8688');
  });

  it('renders with custom color', () => {
    render(<MapMarker longitude={0} latitude={0} color="#FF0000" />);
    const marker = screen.getByTestId('map-marker');
    expect(marker).toHaveAttribute('data-color', '#FF0000');
  });

  it('renders label when provided', () => {
    render(<MapMarker longitude={0} latitude={0} label="Test Location" />);
    expect(screen.getByText('Test Location')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<MapMarker longitude={0} latitude={0} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders cluster count when clustered', () => {
    render(
      <MapMarker longitude={0} latitude={0} clustered clusterCount={5} />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    render(<MapMarker longitude={151.2} latitude={-33.8} label="Office" />);
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument();
  });

  it('applies active ring when active', () => {
    render(<MapMarker longitude={0} latitude={0} active />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('ring-2');
  });
});
