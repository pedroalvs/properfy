import { render, screen } from '@testing-library/react';
import { AvailabilityGrid } from '../AvailabilityGrid';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

vi.mock('../AvailabilityCell', () => ({
  AvailabilityCell: ({ label, active, override }: { label: string; active: boolean; override: boolean }) => (
    <div data-testid="availability-cell" data-active={String(active)} data-override={String(override)}>
      {label}
    </div>
  ),
}));

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const availability: InspectorAvailabilityResponse = {
  template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
  overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
};

describe('AvailabilityGrid', () => {
  it('renders a grid with 7 day columns', () => {
    render(<AvailabilityGrid availability={availability} />);
    const grid = screen.getByTestId('availability-grid');
    expect(grid).toBeTruthy();
  });

  it('renders 14 cells (7 days × 2 half-days)', () => {
    render(<AvailabilityGrid availability={availability} />);
    const cells = screen.getAllByTestId('availability-cell');
    expect(cells).toHaveLength(14);
  });

  it('passes correct active flag for Monday AM', () => {
    render(<AvailabilityGrid availability={availability} />);
    const cells = screen.getAllByTestId('availability-cell');
    // First cell = Mon AM (active=true per template)
    expect(cells[0]).toHaveAttribute('data-active', 'true');
    expect(cells[0]).toHaveTextContent('AM');
  });

  it('passes correct active flag for Tuesday AM', () => {
    render(<AvailabilityGrid availability={availability} />);
    const cells = screen.getAllByTestId('availability-cell');
    // Second cell = Tue AM (index 1, active=false per template)
    expect(cells[1]).toHaveAttribute('data-active', 'false');
    expect(cells[1]).toHaveTextContent('AM');
  });

  it('shows all 7 day labels', () => {
    render(<AvailabilityGrid availability={availability} />);
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day) => {
      expect(screen.getByText(day)).toBeTruthy();
    });
  });

  it('renders loading skeleton when availability is undefined', () => {
    render(<AvailabilityGrid availability={undefined} />);
    expect(screen.getByTestId('availability-grid-loading')).toBeTruthy();
  });
});
