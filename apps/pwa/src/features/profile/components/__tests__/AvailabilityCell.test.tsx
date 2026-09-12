import { render, screen, fireEvent } from '@testing-library/react';
import { AvailabilityCell } from '../AvailabilityCell';

describe('AvailabilityCell', () => {
  it('renders ON state when template is true and no override', () => {
    render(<AvailabilityCell active={true} override={false} label="AM" />);
    const cell = screen.getByTestId('availability-cell');
    expect(cell).toHaveAttribute('data-state', 'on');
    expect(cell).toHaveTextContent('AM');
  });

  it('renders ON+override state when template is true and override is true', () => {
    render(<AvailabilityCell active={true} override={true} label="AM" />);
    const cell = screen.getByTestId('availability-cell');
    expect(cell).toHaveAttribute('data-state', 'on-override');
  });

  it('renders OFF state when template is false and no override', () => {
    render(<AvailabilityCell active={false} override={false} label="PM" />);
    const cell = screen.getByTestId('availability-cell');
    expect(cell).toHaveAttribute('data-state', 'off');
    expect(cell).toHaveTextContent('PM');
  });

  it('renders OFF+override (externally scheduled) when template is false but override is true', () => {
    render(<AvailabilityCell active={false} override={true} label="PM" />);
    const cell = screen.getByTestId('availability-cell');
    expect(cell).toHaveAttribute('data-state', 'off-override');
  });

  it('renders as a button and fires onToggle when clickable', () => {
    const onToggle = vi.fn();
    render(<AvailabilityCell active={false} override={false} label="AM" onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'AM' });

    expect(cell).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(cell);

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects the active state via aria-pressed when clickable', () => {
    render(<AvailabilityCell active={true} override={false} label="PM" onToggle={() => {}} />);
    const cell = screen.getByRole('button', { name: 'PM' });
    expect(cell).toHaveAttribute('aria-pressed', 'true');
  });
});
