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

/**
 * ARIA tabs pattern. Unlike the listbox widgets, these are real <button>s, so
 * they were already operable — Tab reached them and Enter activated them. What
 * was missing is conformance: a tablist is one tab stop, and arrow keys move
 * between tabs (roving tabindex).
 */
describe('FilterSegmented keyboard navigation', () => {
  const three = [...options, { label: 'Regions', value: 'regions' }];

  function renderThree(value = 'appointments', onChange = vi.fn()) {
    render(<FilterSegmented label="Mode" value={value} options={three} onChange={onChange} />);
    return onChange;
  }

  it('keeps only the selected tab in the tab order', () => {
    renderThree('groups');

    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Appointments' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Regions' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects the next and previous tab with the arrow keys, wrapping around', () => {
    const onChange = renderThree('appointments');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appointments' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('groups');

    // Wraps backwards from the first tab to the last — the tabs pattern is a
    // loop, unlike the listbox which stops at its ends.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appointments' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('regions');
  });

  it('jumps to the first and last tab with Home and End', () => {
    const onChange = renderThree('groups');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Groups' }), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('appointments');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Groups' }), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('regions');
  });

  it('ignores keys it does not own', () => {
    const onChange = renderThree('appointments');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appointments' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appointments' }), { key: 'a' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
