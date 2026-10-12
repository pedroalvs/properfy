import { render, screen, fireEvent } from '@testing-library/react';
import { Segmented } from '../Segmented';

const OPTIONS = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
] as const;

describe('Segmented', () => {
  it('renders one tab per option inside a tablist', () => {
    render(<Segmented value="list" options={OPTIONS} onChange={() => {}} aria-label="View" />);
    expect(screen.getByRole('tablist', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Map' })).toBeInTheDocument();
  });

  it('marks the active option as selected', () => {
    render(<Segmented value="map" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the clicked option id', () => {
    const onChange = vi.fn();
    render(<Segmented value="list" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });

  it('merges a caller className onto the container', () => {
    render(<Segmented value="list" options={OPTIONS} onChange={() => {}} className="mx-4" />);
    expect(screen.getByRole('tablist').className).toContain('mx-4');
  });
});
