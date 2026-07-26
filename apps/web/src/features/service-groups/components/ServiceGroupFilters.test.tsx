import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceGroupFilters } from './ServiceGroupFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ServiceGroupFilters', () => {
  it('renders both filter controls', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('status select shows "All" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Awaiting Inspector'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'PUBLISHED' });
  });

  it('search field advertises what the backend actually matches', () => {
    render(
      <ServiceGroupFilters
        filters={{ ...DEFAULT_FILTERS, search: 'x' }}
        onFiltersChange={() => {}}
      />,
    );
    // The backend matches group description + numeric group code only, so the
    // placeholder must not promise region/inspector search.
    expect(screen.getByPlaceholderText('Group code, description...')).toBeInTheDocument();
  });

  it('reflects the current search value', () => {
    render(
      <ServiceGroupFilters
        filters={{ ...DEFAULT_FILTERS, search: '1042' }}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Search')).toHaveValue('1042');
  });

  // Fake timers are scoped to this block: userEvent.setup() in the tests above
  // deadlocks against them unless given an `advanceTimers` bridge.
  describe('search debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onFiltersChange with the search term after the 300ms debounce', () => {
      const onChange = vi.fn();
      render(
        <ServiceGroupFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={onChange}
        />,
      );

      act(() => {
        fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'roof' } });
      });
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, search: 'roof' });
    });

    it('preserves the active status when the search changes', () => {
      const onChange = vi.fn();
      render(
        <ServiceGroupFilters
          filters={{ ...DEFAULT_FILTERS, status: 'PUBLISHED' }}
          onFiltersChange={onChange}
        />,
      );

      act(() => {
        fireEvent.change(screen.getByLabelText('Search'), { target: { value: '77' } });
        vi.advanceTimersByTime(300);
      });

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'PUBLISHED', search: '77' });
    });
  });
});
