import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterSelect } from './FilterSelect';

const options = [
  { label: 'Ativo', value: 'active' },
  { label: 'Inativo', value: 'inactive' },
];

describe('FilterSelect', () => {
  it('renders label', () => {
    render(<FilterSelect label="Status" value="" onChange={() => {}} options={options} />);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<FilterSelect label="Status" value="" onChange={() => {}} options={options} />);

    await user.click(screen.getByLabelText('Status'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('calls onChange with selected value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSelect label="Status" value="" onChange={onChange} options={options} />);

    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Ativo'));
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('shows selected option label', () => {
    render(<FilterSelect label="Status" value="active" onChange={() => {}} options={options} />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });
});

/**
 * Keyboard access (WAI-ARIA listbox). The menu is built from <li>, which cannot
 * hold focus, so focus stays on the trigger and the active option is published
 * through aria-activedescendant. Mirrors SelectInput, the reference pattern.
 */
describe('FilterSelect keyboard navigation', () => {
  const threeOptions = [...options, { label: 'Bloqueado', value: 'locked' }];

  // Scoped by role: the open listbox carries the same aria-label as its
  // trigger, so getByLabelText would match both.
  const trigger = () => screen.getByRole('button', { name: 'Status' });

  function activeOptionLabel() {
    const id = trigger().getAttribute('aria-activedescendant');
    return id ? document.getElementById(id)?.textContent : null;
  }

  function renderAndFocus(value = '', onChange = () => {}) {
    render(<FilterSelect label="Status" value={value} onChange={onChange} options={threeOptions} />);
    trigger().focus();
  }

  it('opens with ArrowDown without needing a click', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(activeOptionLabel()).toBe('Ativo');
  });

  it('moves the active option with the arrow keys and stops at the ends', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOptionLabel()).toBe('Inativo');

    await user.keyboard('{ArrowUp}');
    expect(activeOptionLabel()).toBe('Ativo');

    // Already at the first option — does not wrap past the start.
    await user.keyboard('{ArrowUp}');
    expect(activeOptionLabel()).toBe('Ativo');
  });

  it('jumps to the first and last option with Home and End', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}{End}');
    expect(activeOptionLabel()).toBe('Bloqueado');

    await user.keyboard('{Home}');
    expect(activeOptionLabel()).toBe('Ativo');
  });

  it('selects the active option with Enter and closes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAndFocus('', onChange);

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('inactive');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape without selecting', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAndFocus('', onChange);

    await user.keyboard('{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('consumes Escape so an enclosing dialog does not close too', async () => {
    // Dialog listens for Escape on document. Without stopPropagation the key
    // that dismisses the menu also dismisses the whole modal.
    const onDocumentEscape = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDocumentEscape();
    };
    document.addEventListener('keydown', listener);
    try {
      const user = userEvent.setup();
      renderAndFocus();

      await user.keyboard('{ArrowDown}{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onDocumentEscape).not.toHaveBeenCalled();

      // With the menu closed, Escape is no longer ours to swallow.
      await user.keyboard('{Escape}');
      expect(onDocumentEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('closes the menu on Tab so focus never leaves one stranded open', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('starts navigation from the currently selected option', async () => {
    const user = userEvent.setup();
    renderAndFocus('locked');

    await user.keyboard('{ArrowDown}');

    expect(activeOptionLabel()).toBe('Bloqueado');
  });

  it('links the trigger to the listbox for assistive tech', async () => {
    const user = userEvent.setup();
    render(<FilterSelect label="Status" value="" onChange={() => {}} options={threeOptions} />);

    await user.click(trigger());

    const listboxId = screen.getByRole('listbox').getAttribute('id');
    expect(listboxId).toBeTruthy();
    expect(trigger()).toHaveAttribute('aria-controls', listboxId!);
  });

  // openMenu and Home both used to seed index 0 unconditionally, naming an
  // option id over an empty <ul>. End was already correct, so the keys
  // disagreed with each other.
  it.each(['{ArrowDown}', '{ArrowUp}', '{Home}', '{End}'])(
    'never advertises an option when there are none (%s)',
    async (key) => {
      const user = userEvent.setup();
      render(<FilterSelect label="Status" value="" onChange={() => {}} options={[]} />);
      trigger().focus();

      await user.keyboard('{ArrowDown}');
      await user.keyboard(key);

      expect(trigger()).not.toHaveAttribute('aria-activedescendant');
    },
  );

  // Checked at the moment of opening: the first navigation key overwrites
  // whatever openMenu seeded, so a test that presses one can never observe it.
  it('advertises nothing at the moment an empty menu opens', async () => {
    const user = userEvent.setup();
    render(<FilterSelect label="Status" value="" onChange={() => {}} options={[]} />);
    trigger().focus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(trigger()).not.toHaveAttribute('aria-activedescendant');
  });

  it('drops a stale active index when the option list shrinks', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FilterSelect label="Status" value="" onChange={() => {}} options={threeOptions} />,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}{End}');
    expect(trigger()).toHaveAttribute('aria-activedescendant');

    // A background refetch shrinks the list under the open menu; without the
    // guard, activedescendant names a missing id and Enter silently no-ops.
    rerender(
      <FilterSelect label="Status" value="" onChange={() => {}} options={[threeOptions[0]!]} />,
    );

    expect(trigger()).not.toHaveAttribute('aria-activedescendant');
  });

  // The keyboard position must be tellable apart from the selection, otherwise
  // arrowing past the selected row leaves the user with no idea where they are.
  it('marks the keyboard-active option distinctly from the selected one', async () => {
    const user = userEvent.setup();
    renderAndFocus('active');

    await user.keyboard('{ArrowDown}{ArrowDown}');

    const listbox = within(screen.getByRole('listbox'));
    const selected = listbox.getByText('Ativo');
    const highlighted = listbox.getByText('Inativo');
    expect(activeOptionLabel()).toBe('Inativo');
    expect(highlighted.className).not.toBe(selected.className);
  });
});
