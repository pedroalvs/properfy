import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapContainer } from './MapContainer';

describe('MapContainer', () => {
  it('renders map container with default view state', () => {
    render(<MapContainer />);
    const container = screen.getByTestId('map-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('data-longitude', '133.7751');
    expect(container).toHaveAttribute('data-latitude', '-25.2744');
    expect(container).toHaveAttribute('data-zoom', '4');
  });

  it('renders with custom initial view state', () => {
    render(
      <MapContainer
        initialViewState={{ longitude: 151.2093, latitude: -33.8688, zoom: 12 }}
      />,
    );
    const container = screen.getByTestId('map-container');
    expect(container).toHaveAttribute('data-longitude', '151.2093');
    expect(container).toHaveAttribute('data-latitude', '-33.8688');
    expect(container).toHaveAttribute('data-zoom', '12');
  });

  it('renders children as overlay', () => {
    render(
      <MapContainer>
        <div data-testid="child-marker">Marker</div>
      </MapContainer>,
    );
    expect(screen.getByTestId('child-marker')).toBeInTheDocument();
  });

  it('renders map canvas when ready', () => {
    render(<MapContainer />);
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
  });

  it('has accessible role and label', () => {
    render(<MapContainer />);
    const container = screen.getByRole('application', { name: 'Map' });
    expect(container).toBeInTheDocument();
  });

  it('calls onMapClick when clicked', () => {
    const handleClick = vi.fn();
    render(<MapContainer onMapClick={handleClick} />);
    fireEvent.click(screen.getByTestId('map-container'));
    expect(handleClick).toHaveBeenCalled();
  });
});
