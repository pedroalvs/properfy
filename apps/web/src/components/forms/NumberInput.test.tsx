import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('renders input with value', () => {
    render(<NumberInput value="42" onChange={() => {}} aria-label="Valor" />);
    expect(screen.getByDisplayValue('42')).toBeInTheDocument();
  });

  it('calls onChange on valid numeric input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput value="" onChange={onChange} aria-label="Valor" />);
    await user.type(screen.getByRole('textbox'), '5');
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('shows placeholder', () => {
    render(<NumberInput value="" onChange={() => {}} placeholder="0.00" aria-label="Valor" />);
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
  });

  it('renders disabled state', () => {
    render(<NumberInput value="" onChange={() => {}} disabled aria-label="Valor" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(
      <NumberInput value="" onChange={() => {}} error aria-label="Valor" />,
    );
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });
});
