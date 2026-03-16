import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectInput } from './SelectInput';

const options = [
  { label: 'Ativo', value: 'active' },
  { label: 'Inativo', value: 'inactive' },
  { label: 'Bloqueado', value: 'locked' },
];

describe('SelectInput', () => {
  it('renders selected option label', () => {
    render(<SelectInput value="active" onChange={() => {}} options={options} aria-label="Status" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders placeholder when no value', () => {
    render(
      <SelectInput value="" onChange={() => {}} options={options} placeholder="Selecione" aria-label="Status" />,
    );
    expect(screen.getByText('Selecione')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<SelectInput value="" onChange={() => {}} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('selects option and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectInput value="" onChange={onChange} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Inativo'));
    expect(onChange).toHaveBeenCalledWith('inactive');
  });

  it('closes dropdown after selection', async () => {
    const user = userEvent.setup();
    render(<SelectInput value="" onChange={() => {}} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Ativo'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows disabled state', () => {
    render(<SelectInput value="" onChange={() => {}} options={options} disabled aria-label="Status" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(
      <SelectInput value="" onChange={() => {}} options={options} error aria-label="Status" />,
    );
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });
});
