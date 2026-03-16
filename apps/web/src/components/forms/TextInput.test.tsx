import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders input with value', () => {
    render(<TextInput value="Pedro" onChange={() => {}} aria-label="Nome" />);
    expect(screen.getByDisplayValue('Pedro')).toBeInTheDocument();
  });

  it('calls onChange on typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} aria-label="Nome" />);
    await user.type(screen.getByRole('textbox'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('shows placeholder', () => {
    render(<TextInput value="" onChange={() => {}} placeholder="Digite aqui" aria-label="Campo" />);
    expect(screen.getByPlaceholderText('Digite aqui')).toBeInTheDocument();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(<TextInput value="" onChange={() => {}} error aria-label="Campo" />);
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });

  it('renders disabled state', () => {
    render(<TextInput value="" onChange={() => {}} disabled aria-label="Campo" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('passes id and aria-label through', () => {
    render(<TextInput value="" onChange={() => {}} id="email-input" aria-label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'email-input');
  });
});
