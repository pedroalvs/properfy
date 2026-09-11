import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import type { AgencyOption } from '../hooks/useAgencySearch';

const { mockUseAgencySearch, mockSetSearch, mockReset } = vi.hoisted(() => ({
  mockUseAgencySearch: vi.fn(),
  mockSetSearch: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock('../hooks/useAgencySearch', () => ({
  useAgencySearch: mockUseAgencySearch,
}));
// Keep the initial-label detail query inert (value='' in these tests anyway).
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));

function setHook(over: Partial<ReturnType<typeof buildReturn>> = {}) {
  mockUseAgencySearch.mockReturnValue({ ...buildReturn(), ...over });
}
function buildReturn(results: AgencyOption[] = [], total = 0) {
  return {
    search: '',
    debouncedSearch: '',
    results,
    total,
    isSearching: false,
    setSearch: mockSetSearch,
    reset: mockReset,
  };
}

function renderSelect(props: Partial<Parameters<typeof AgencySelectDefault>[0]> = {}) {
  const onChange = vi.fn();
  render(<AgencySelectDefault value="" onChange={onChange} {...props} />, {
    wrapper: createQueryWrapper(),
  });
  return { onChange, input: screen.getByRole('combobox') };
}

// Imported after the mocks are registered.
import { AgencySelect as AgencySelectDefault } from './AgencySelect';

beforeEach(() => {
  vi.clearAllMocks();
  setHook();
});

describe('AgencySelect', () => {
  const TWO: AgencyOption[] = [
    { id: 't1', name: 'Acme Realty' },
    { id: 't2', name: 'Beta Homes' },
  ];

  it('shows the "type to search more" hint when more agencies exist than are listed', () => {
    setHook(buildReturn(Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, name: `Agency ${i}` })), 250));
    const { input } = renderSelect();
    fireEvent.focus(input);
    expect(screen.getByText('Type to search more agencies')).toBeInTheDocument();
  });

  it('omits the hint when the full set is shown', () => {
    setHook(buildReturn(TWO, 2));
    const { input } = renderSelect();
    fireEvent.focus(input);
    expect(screen.queryByText('Type to search more agencies')).not.toBeInTheDocument();
  });

  it('forwards typed text to the search hook', () => {
    setHook(buildReturn(TWO, 2));
    const { input } = renderSelect();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'acme' } });
    expect(mockSetSearch).toHaveBeenCalledWith('acme');
  });

  it('selects the keyboard-active agency with Enter and reports its id', () => {
    setHook(buildReturn(TWO, 2));
    const { input, onChange } = renderSelect();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active -> t1
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('t1');
    expect(notPrevented).toBe(false);
  });

  it('closes on Escape and consumes it so an enclosing drawer stays open', () => {
    setHook(buildReturn(TWO, 2));
    const onDocumentEscape = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDocumentEscape();
    };
    document.addEventListener('keydown', listener);
    try {
      const { input } = renderSelect();
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onDocumentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('never lands the active index on the "No agencies found" status row', () => {
    setHook(buildReturn([], 0));
    const { input } = renderSelect();
    fireEvent.focus(input);
    expect(screen.getByText('No agencies found')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('marks the selected agency and keeps active highlight distinct', () => {
    setHook(buildReturn(TWO, 2));
    const { input } = renderSelect({ value: 't2', initialLabel: 'Beta Homes' });
    fireEvent.focus(input);
    const selected = screen.getByRole('option', { name: /Beta Homes/ });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    const other = screen.getByRole('option', { name: /Acme Realty/ });
    expect(other).toHaveAttribute('aria-selected', 'false');
  });
});
