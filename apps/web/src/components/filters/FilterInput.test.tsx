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

  describe('Enter submit', () => {
    it('flushes the pending debounce before firing onSubmit', () => {
      // Enter typed straight after the last keystroke must not submit the
      // PREVIOUS term — the consumer refetches off `onChange`, so the flush has
      // to land first or the map would frame the old results.
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const order: string[] = [];
      onChange.mockImplementation(() => order.push('change'));
      onSubmit.mockImplementation(() => order.push('submit'));

      render(<FilterInput label="Buscar" value="" onChange={onChange} onSubmit={onSubmit} />);
      const input = screen.getByLabelText('Buscar');

      act(() => {
        fireEvent.change(input, { target: { value: '25' } });
      });
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      expect(onChange).toHaveBeenCalledWith('25');
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['change', 'submit']);
    });

    it('does not re-fire onChange when the debounce already landed', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      render(<FilterInput label="Buscar" value="25" onChange={onChange} onSubmit={onSubmit} />);
      const input = screen.getByLabelText('Buscar');

      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not leave the flushed value queued for a second onChange', () => {
      const onChange = vi.fn();

      render(<FilterInput label="Buscar" value="" onChange={onChange} onSubmit={() => {}} />);
      const input = screen.getByLabelText('Buscar');

      act(() => {
        fireEvent.change(input, { target: { value: '25' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('ignores other keys', () => {
      const onSubmit = vi.fn();

      render(<FilterInput label="Buscar" value="" onChange={() => {}} onSubmit={onSubmit} />);
      const input = screen.getByLabelText('Buscar');

      act(() => {
        fireEvent.keyDown(input, { key: 'a' });
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not throw on Enter when no onSubmit is supplied', () => {
      render(<FilterInput label="Buscar" value="" onChange={() => {}} />);
      const input = screen.getByLabelText('Buscar');

      expect(() => {
        act(() => {
          fireEvent.keyDown(input, { key: 'Enter' });
        });
      }).not.toThrow();
    });
  });
});
