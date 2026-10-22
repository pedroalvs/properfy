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

  it('matches the .pf-seg geometry: 12px container, 5px padding, 4px gap, 9px/40px/700 tabs', () => {
    render(<Segmented value="list" options={OPTIONS} onChange={() => {}} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('rounded-[12px]');
    expect(tablist.className).toContain('p-[5px]');
    expect(tablist.className).toContain('gap-1');
    const tab = screen.getByRole('tab', { name: 'List' });
    expect(tab.className).toContain('rounded-[9px]');
    expect(tab.className).toContain('h-10');
    expect(tab.className).toContain('font-bold');
  });
});
