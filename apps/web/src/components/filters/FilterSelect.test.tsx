import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
