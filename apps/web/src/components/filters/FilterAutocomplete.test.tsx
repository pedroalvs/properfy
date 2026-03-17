import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterAutocomplete } from './FilterAutocomplete';

const options = [
  { label: 'São Paulo', value: 'sp' },
  { label: 'Rio de Janeiro', value: 'rj' },
  { label: 'Curitiba', value: 'ctb' },
];

describe('FilterAutocomplete', () => {
  it('renders with search icon', () => {
    render(
      <FilterAutocomplete label="Cidade" value="" onChange={() => {}} options={options} />,
    );
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeInTheDocument();
  });

  it('opens dropdown on focus and shows all options', async () => {
    const user = userEvent.setup();
    render(
      <FilterAutocomplete label="Cidade" value="" onChange={() => {}} options={options} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Cidade' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('São Paulo')).toBeInTheDocument();
    expect(screen.getByText('Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getByText('Curitiba')).toBeInTheDocument();
  });

  it('filters options as user types', async () => {
    const user = userEvent.setup();
    render(
      <FilterAutocomplete label="Cidade" value="" onChange={() => {}} options={options} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Cidade' }));
    await user.type(screen.getByRole('combobox', { name: 'Cidade' }), 'São');

    expect(screen.getByText('São Paulo')).toBeInTheDocument();
    expect(screen.queryByText('Rio de Janeiro')).not.toBeInTheDocument();
  });

  it('calls onChange when option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterAutocomplete label="Cidade" value="" onChange={onChange} options={options} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Cidade' }));
    await user.click(screen.getByText('Curitiba'));
    expect(onChange).toHaveBeenCalledWith('ctb');
  });

  it('shows no results message when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <FilterAutocomplete label="Cidade" value="" onChange={() => {}} options={options} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Cidade' }));
    await user.type(screen.getByRole('combobox', { name: 'Cidade' }), 'xyz');
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
