import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders textarea with value', () => {
    render(<Textarea value="Observações" onChange={() => {}} aria-label="Obs" />);
    expect(screen.getByDisplayValue('Observações')).toBeInTheDocument();
  });

  it('calls onChange on typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} aria-label="Obs" />);
    await user.type(screen.getByRole('textbox'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('shows placeholder', () => {
    render(<Textarea value="" onChange={() => {}} placeholder="Descreva aqui" aria-label="Obs" />);
    expect(screen.getByPlaceholderText('Descreva aqui')).toBeInTheDocument();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(<Textarea value="" onChange={() => {}} error aria-label="Obs" />);
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });

  it('renders disabled state', () => {
    render(<Textarea value="" onChange={() => {}} disabled aria-label="Obs" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
