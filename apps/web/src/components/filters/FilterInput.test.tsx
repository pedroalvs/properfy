import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FilterInput } from './FilterInput';

describe('FilterInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with search icon', () => {
    render(<FilterInput label="Buscar" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
  });

  it('debounces onChange by 300ms', () => {
    const onChange = vi.fn();
    render(<FilterInput label="Buscar" value="" onChange={onChange} />);

    const input = screen.getByLabelText('Buscar');

    act(() => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('shows floating label on focus', () => {
    render(<FilterInput label="Buscar" value="" onChange={() => {}} />);

    const input = screen.getByLabelText('Buscar');
    act(() => {
      fireEvent.focus(input);
    });

    expect(screen.getByText('Buscar')).toBeInTheDocument();
  });
});
