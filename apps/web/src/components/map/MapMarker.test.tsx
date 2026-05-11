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

  // 025 round-2 regression — Issue #3. While the lasso polygon is being
  // drawn, marker clicks must be disabled — otherwise the click that
  // closes the polygon lands on a marker, gets `stopPropagation`'d, and
  // the lasso never closes ("não estou nem conseguindo fechar o laço").
  it('disabled prop swallows onClick and surfaces a data-disabled marker', () => {
    const handleClick = vi.fn();
    render(<MapMarker longitude={0} latitude={0} onClick={handleClick} disabled />);
    const marker = screen.getByTestId('map-marker');
    expect(marker.getAttribute('data-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('marker label is .select-none so the cursor never flickers to `text`', () => {
    render(<MapMarker longitude={0} latitude={0} label="VST-001" />);
    const label = screen.getByText('VST-001');
    expect(label.className).toContain('select-none');
  });
});
