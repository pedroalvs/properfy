import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSegmented } from './FilterSegmented';

const options = [
  { label: 'Appointments', value: 'appointments' },
  { label: 'Groups', value: 'groups' },
];

describe('FilterSegmented', () => {
  it('renders all option labels', () => {
    render(<FilterSegmented label="Mode" value="appointments" options={options} onChange={vi.fn()} />);
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });

  it('marks the active option with aria-selected=true', () => {
    render(<FilterSegmented label="Mode" value="groups" options={options} onChange={vi.fn()} />);
    const appointmentsBtn = screen.getByRole('tab', { name: 'Appointments' });
    const groupsBtn = screen.getByRole('tab', { name: 'Groups' });
    expect(appointmentsBtn.getAttribute('aria-selected')).toBe('false');
    expect(groupsBtn.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onChange with the option value when clicked', () => {
    const onChange = vi.fn();
    render(<FilterSegmented label="Mode" value="appointments" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    expect(onChange).toHaveBeenCalledWith('groups');
  });
});
