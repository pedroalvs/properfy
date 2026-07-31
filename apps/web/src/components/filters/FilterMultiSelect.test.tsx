import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterMultiSelect } from './FilterMultiSelect';

const options = [
  { label: 'Tenant', value: 'RENTAL_TENANT' },
  { label: 'Owner', value: 'OWNER' },
  { label: 'Property Manager', value: 'PROPERTY_MANAGER' },
];

describe('FilterMultiSelect', () => {
  it('renders the trigger with the label aria-name', () => {
    render(<FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={options} />);
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
  });

  it('opens the listbox on click and announces aria-multiselectable', async () => {
    const user = userEvent.setup();
    render(<FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={options} />);

    await user.click(screen.getByLabelText('Type'));

    const listbox = screen.getByRole('listbox', { name: 'Type' });
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('option', { name: /Tenant/ })).toBeInTheDocument();
  });

  it('toggles selection on click and keeps the dropdown open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterMultiSelect label="Type" value={[]} onChange={onChange} options={options} />);

    await user.click(screen.getByLabelText('Type'));
    await user.click(screen.getByRole('option', { name: /Tenant/ }));

    expect(onChange).toHaveBeenCalledWith(['RENTAL_TENANT']);
    // Dropdown stays open so the user can pick another option without re-clicking the trigger.
    expect(screen.getByRole('listbox', { name: 'Type' })).toBeInTheDocument();
  });

  it('removes a value when clicking an already-selected option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterMultiSelect label="Type" value={['RENTAL_TENANT', 'OWNER']} onChange={onChange} options={options} />,
    );

    await user.click(screen.getByLabelText('Type'));
    await user.click(screen.getByRole('option', { name: /Tenant/ }));

    expect(onChange).toHaveBeenCalledWith(['OWNER']);
  });

  it('shows the single label when exactly one option is selected', () => {
    render(
      <FilterMultiSelect label="Type" value={['OWNER']} onChange={() => {}} options={options} />,
    );

    // The trigger button (and not the dropdown — dropdown is closed) shows the single label.
    expect(screen.getByLabelText('Type')).toHaveTextContent('Owner');
  });

  it('shows "N selected" when more than one option is selected', () => {
    render(
      <FilterMultiSelect
        label="Type"
        value={['RENTAL_TENANT', 'OWNER', 'PROPERTY_MANAGER']}
        onChange={() => {}}
        options={options}
      />,
    );

    expect(screen.getByLabelText('Type')).toHaveTextContent('3 selected');
  });

  it('exposes a clear (×) button when the selection is non-empty and clears on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterMultiSelect label="Type" value={['RENTAL_TENANT']} onChange={onChange} options={options} />,
    );

    const clear = screen.getByLabelText('Clear Type');
    await user.click(clear);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not render a clear button when the selection is empty', () => {
    render(<FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={options} />);
    expect(screen.queryByLabelText('Clear Type')).not.toBeInTheDocument();
  });

  it('respects the disabled prop — trigger is inert and dropdown does not open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterMultiSelect label="Type" value={[]} onChange={onChange} options={options} disabled />,
    );

    const trigger = screen.getByLabelText('Type');
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders an empty state when there are no options', async () => {
    const user = userEvent.setup();
    render(<FilterMultiSelect label="Branches" value={[]} onChange={() => {}} options={[]} />);

    await user.click(screen.getByLabelText('Branches'));
    expect(screen.getByText('No options')).toBeInTheDocument();
  });
});

/**
 * Keyboard access. Same WAI-ARIA listbox pattern as FilterSelect, with two
 * multi-select departures: Space/Enter toggle *without* closing, and the
 * active index must skip the non-option "No options" row.
 */
describe('FilterMultiSelect keyboard navigation', () => {
  // Scoped by role: the open listbox shares its aria-label with the trigger.
  const trigger = () => screen.getByRole('button', { name: 'Type' });

  function activeOptionLabel() {
    const id = trigger().getAttribute('aria-activedescendant');
    return id ? document.getElementById(id)?.textContent?.trim() : null;
  }

  function renderAndFocus(value: string[] = [], onChange = () => {}) {
    render(<FilterMultiSelect label="Type" value={value} onChange={onChange} options={options} />);
    trigger().focus();
  }

  it('opens with ArrowDown and lands on the first option', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(activeOptionLabel()).toBe('Tenant');
  });

  it('moves with the arrow keys and stops at both ends', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(activeOptionLabel()).toBe('Property Manager');

    // Already last — does not wrap.
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toBe('Property Manager');

    await user.keyboard('{Home}');
    expect(activeOptionLabel()).toBe('Tenant');

    await user.keyboard('{End}');
    expect(activeOptionLabel()).toBe('Property Manager');
  });

  it('toggles with Space and keeps the menu open for the next pick', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAndFocus([], onChange);

    await user.keyboard('{ArrowDown}[Space]');

    expect(onChange).toHaveBeenCalledWith(['RENTAL_TENANT']);
    // The whole point of multi-select: selecting must not dismiss the list.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('deselects an already-selected option with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAndFocus(['RENTAL_TENANT'], onChange);

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('closes on Escape and consumes it so a dialog does not close too', async () => {
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

      // The release direction. Without it, hoisting stopPropagation above the
      // `!open` early-return would trap users inside drawers with every test
      // still green.
      await user.keyboard('{Escape}');
      expect(onDocumentEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('closes on Tab instead of stranding the menu open', async () => {
    const user = userEvent.setup();
    renderAndFocus();

    await user.keyboard('{ArrowDown}');
    await user.tab();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // Regression guard: options used to carry tabIndex={0}, so Tab walked
  // through every one of them instead of leaving the control.
  it('keeps options out of the tab order', async () => {
    const user = userEvent.setup();
    renderAndFocus();
    await user.keyboard('{ArrowDown}');

    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveAttribute('tabindex');
    }
  });

  // Every navigation key, not just ArrowDown: `Math.max(-2, 0)` made ArrowUp
  // land on index 0 over a list whose only row is the id-less "No options".
  it.each(['{ArrowDown}', '{ArrowUp}', '{Home}', '{End}'])(
    'never lands the active index on the "No options" row (%s)',
    async (key) => {
      const user = userEvent.setup();
      render(<FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={[]} />);
      trigger().focus();

      await user.keyboard('{ArrowDown}');
      await user.keyboard(key);

      expect(screen.getByText('No options')).toBeInTheDocument();
      expect(trigger()).not.toHaveAttribute('aria-activedescendant');
    },
  );

  // IDL, not the attribute: rewriting rows as inherently-focusable elements
  // would resurrect the N-tab-stops bug while an attribute check stayed green.
  it('keeps options out of the tab order by computed tabIndex', async () => {
    const user = userEvent.setup();
    renderAndFocus();
    await user.keyboard('{ArrowDown}');

    for (const option of screen.getAllByRole('option')) {
      expect((option as HTMLElement).tabIndex).toBe(-1);
    }
  });

  it('drops a stale active index when the option list shrinks', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={options} />,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}{End}');
    expect(trigger()).toHaveAttribute('aria-activedescendant');

    // A background refetch shrinks the list under the open menu.
    rerender(
      <FilterMultiSelect label="Type" value={[]} onChange={() => {}} options={[options[0]!]} />,
    );

    expect(trigger()).not.toHaveAttribute('aria-activedescendant');
  });
});
