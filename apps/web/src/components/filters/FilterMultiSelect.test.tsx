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
