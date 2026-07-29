import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AvailableSlot } from '@properfy/shared';
import { TenantAvailabilitySlots } from './TenantAvailabilitySlots';

describe('TenantAvailabilitySlots', () => {
  it('renders one entry per slot as "Day start - end"', () => {
    const slots: AvailableSlot[] = [
      { dayOfWeek: 'MON', start: '09:00', end: '17:00' },
      { dayOfWeek: 'WED', start: '10:00', end: '14:00' },
    ];

    render(<TenantAvailabilitySlots slots={slots} />);

    expect(screen.getByText('Mon 09:00 - 17:00')).toBeInTheDocument();
    expect(screen.getByText('Wed 10:00 - 14:00')).toBeInTheDocument();
  });

  it('orders slots Monday through Sunday regardless of input order', () => {
    const slots: AvailableSlot[] = [
      { dayOfWeek: 'SUN', start: '08:00', end: '12:00' },
      { dayOfWeek: 'TUE', start: '09:00', end: '17:00' },
      { dayOfWeek: 'SAT', start: '10:00', end: '13:00' },
    ];

    render(<TenantAvailabilitySlots slots={slots} />);

    const rendered = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rendered).toEqual([
      'Tue 09:00 - 17:00',
      'Sat 10:00 - 13:00',
      'Sun 08:00 - 12:00',
    ]);
  });

  it('renders nothing when there are no slots', () => {
    const { container } = render(<TenantAvailabilitySlots slots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when slots is null or undefined', () => {
    const { container: nullContainer } = render(<TenantAvailabilitySlots slots={null} />);
    expect(nullContainer).toBeEmptyDOMElement();

    const { container: undefinedContainer } = render(<TenantAvailabilitySlots />);
    expect(undefinedContainer).toBeEmptyDOMElement();
  });
});
