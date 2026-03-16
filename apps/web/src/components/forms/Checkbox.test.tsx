import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders unchecked state with label', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Ativo" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders checked state', () => {
    render(<Checkbox checked onChange={() => {}} label="Ativo" />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onChange on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Ativo" />);
    await user.click(screen.getByText('Ativo'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders disabled state', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Ativo" disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
