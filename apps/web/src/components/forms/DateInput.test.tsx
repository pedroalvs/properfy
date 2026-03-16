import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { DateInput } from './DateInput';

describe('DateInput', () => {
  it('renders input with value', () => {
    render(<DateInput value="2026-03-16" onChange={() => {}} aria-label="Data" />);
    expect(screen.getByDisplayValue('2026-03-16')).toBeInTheDocument();
  });

  it('calls onChange on date change', () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Data" />);
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-04-01' } });
    expect(onChange).toHaveBeenCalledWith('2026-04-01');
  });

  it('respects min and max attributes', () => {
    render(
      <DateInput value="" onChange={() => {}} min="2026-01-01" max="2026-12-31" aria-label="Data" />,
    );
    const input = screen.getByLabelText('Data');
    expect(input).toHaveAttribute('min', '2026-01-01');
    expect(input).toHaveAttribute('max', '2026-12-31');
  });

  it('renders disabled state', () => {
    render(<DateInput value="" onChange={() => {}} disabled aria-label="Data" />);
    expect(screen.getByLabelText('Data')).toBeDisabled();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(<DateInput value="" onChange={() => {}} error aria-label="Data" />);
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });
});
