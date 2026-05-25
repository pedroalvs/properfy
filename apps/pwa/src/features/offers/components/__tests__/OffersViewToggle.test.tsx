import { render, screen, fireEvent } from '@testing-library/react';
import { OffersViewToggle } from '../OffersViewToggle';

describe('OffersViewToggle', () => {
  it('renders List and Map buttons', () => {
    render(<OffersViewToggle value="list" onChange={vi.fn()} />);
    expect(screen.getByText('List')).toBeTruthy();
    expect(screen.getByText('Map')).toBeTruthy();
  });

  it('shows List as active when value is list', () => {
    render(<OffersViewToggle value="list" onChange={vi.fn()} />);
    expect(screen.getByText('List')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Map')).toHaveAttribute('data-active', 'false');
  });

  it('shows Map as active when value is map', () => {
    render(<OffersViewToggle value="map" onChange={vi.fn()} />);
    expect(screen.getByText('Map')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('List')).toHaveAttribute('data-active', 'false');
  });

  it('calls onChange with "map" when Map is clicked', () => {
    const onChange = vi.fn();
    render(<OffersViewToggle value="list" onChange={onChange} />);
    fireEvent.click(screen.getByText('Map'));
    expect(onChange).toHaveBeenCalledWith('map');
  });

  it('calls onChange with "list" when List is clicked', () => {
    const onChange = vi.fn();
    render(<OffersViewToggle value="map" onChange={onChange} />);
    fireEvent.click(screen.getByText('List'));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
