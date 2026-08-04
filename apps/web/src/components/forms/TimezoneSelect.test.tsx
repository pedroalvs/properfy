import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimezoneSelect } from './TimezoneSelect';

function getInput() {
  return screen.getByRole('combobox', { name: 'Timezone' });
}

describe('TimezoneSelect', () => {
  it('shows the selected option label when closed', () => {
    render(<TimezoneSelect value="Australia/Sydney" onChange={() => {}} />);
    // The offset label is a snapshot of "now": +10 in winter, +11 during DST.
    expect(getInput().getAttribute('value')).toMatch(/^Sydney \(GMT\+1[01]\)$/);
  });

  it('filters options as the user types', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect value={null} onChange={() => {}} />);
    await user.click(getInput());
    await user.keyboard('perth');

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toContain('Perth (GMT+8)');
    expect(options.length).toBeLessThan(5);
  });

  it('finds diacritic/underscore zones from a plain query', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect value={null} onChange={() => {}} />);
    await user.click(getInput());
    await user.keyboard('sao paulo');

    expect(screen.getByRole('option', { name: /Sao Paulo/ })).toBeInTheDocument();
  });

  it('selects the active option on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimezoneSelect value={null} onChange={onChange} />);
    await user.click(getInput());
    await user.keyboard('perth');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Australia/Perth');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('stops Escape from bubbling to an enclosing dialog', async () => {
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <TimezoneSelect value={null} onChange={() => {}} />
      </div>,
    );
    await user.click(getInput());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it('never lands the active descendant on a group header', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect value={null} onChange={() => {}} />);
    await user.click(getInput());
    // Walk far enough to cross the Australia -> next region boundary.
    for (let i = 0; i < 30; i++) {
      await user.keyboard('{ArrowDown}');
    }

    const activeId = getInput().getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    const active = document.getElementById(activeId as string);
    expect(active).toHaveRole('option');
  });

  it('clamps ArrowUp at the first option and ArrowDown at the last', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect value={null} onChange={() => {}} />);
    await user.click(getInput());
    await user.keyboard('perth');

    const options = screen.getAllByRole('option');
    // Past the end: stays on the last option.
    for (let i = 0; i < options.length + 3; i++) {
      await user.keyboard('{ArrowDown}');
    }
    expect(getInput()).toHaveAttribute(
      'aria-activedescendant',
      options[options.length - 1]!.id,
    );
    // Past the start: stays on the first option.
    for (let i = 0; i < options.length + 3; i++) {
      await user.keyboard('{ArrowUp}');
    }
    expect(getInput()).toHaveAttribute('aria-activedescendant', options[0]!.id);
  });

  it('shows disabled state', () => {
    render(<TimezoneSelect value={null} onChange={() => {}} disabled />);
    expect(getInput()).toBeDisabled();
  });
});
