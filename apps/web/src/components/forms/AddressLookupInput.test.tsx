import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AddressLookupSuggestion } from '@/lib/address';

const { mockUseAddressSuggestions } = vi.hoisted(() => ({
  mockUseAddressSuggestions: vi.fn(),
}));

vi.mock('@/features/properties/hooks/useAddressSuggestions', () => ({
  useAddressSuggestions: mockUseAddressSuggestions,
}));

import { AddressLookupInput } from './AddressLookupInput';

function suggestion(overrides: Partial<AddressLookupSuggestion> = {}): AddressLookupSuggestion {
  return {
    formattedAddress: '1 George St, Sydney NSW 2000',
    street: '1 George St',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    latitude: -33.86,
    longitude: 151.2,
    provider: 'MAPBOX',
    ...overrides,
  };
}

const suggestions = [
  suggestion(),
  suggestion({
    formattedAddress: '2 Collins St, Melbourne VIC 3000',
    street: '2 Collins St',
    suburb: 'Melbourne',
    postcode: '3000',
    state: 'VIC',
    latitude: -37.81,
    longitude: 144.96,
  }),
];

function renderInput(props: Partial<Parameters<typeof AddressLookupInput>[0]> = {}) {
  const onSelect = vi.fn();
  const onClear = vi.fn();
  render(
    <AddressLookupInput
      label="Address"
      valueLabel=""
      onSelect={onSelect}
      onClear={onClear}
      {...props}
    />,
  );
  return { onSelect, onClear, input: screen.getByRole('combobox') };
}

/** Opens the list with both suggestions loaded. */
function renderAndOpen() {
  const api = renderInput();
  fireEvent.focus(api.input);
  fireEvent.change(api.input, { target: { value: 'george' } });
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAddressSuggestions.mockReturnValue({ data: suggestions, isLoading: false });
});

describe('AddressLookupInput', () => {
  it('exposes a combobox with the label as its accessible name', () => {
    const { input } = renderInput();
    expect(input).toHaveAttribute('aria-label', 'Address');
  });

  it('lists the suggestions once open', () => {
    renderAndOpen();
    expect(screen.getByText('1 George St, Sydney NSW 2000')).toBeInTheDocument();
    expect(screen.getByText('2 Collins St, Melbourne VIC 3000')).toBeInTheDocument();
  });

  it('selects a suggestion on click', () => {
    const { onSelect } = renderAndOpen();
    fireEvent.click(screen.getByText('2 Collins St, Melbourne VIC 3000'));
    expect(onSelect).toHaveBeenCalledWith(suggestions[1]);
  });
});

/**
 * Keyboard access (WAI-ARIA combobox). Suggestions are <li>, which cannot hold
 * focus, so focus stays in the input and the active suggestion is published
 * through aria-activedescendant. Mirrors ContactAutocomplete.
 */
describe('AddressLookupInput keyboard navigation', () => {
  function activeLabel(input: HTMLElement) {
    const id = input.getAttribute('aria-activedescendant');
    return id ? document.getElementById(id)?.textContent : null;
  }

  it('moves through suggestions with the arrow keys and stops at the ends', () => {
    const { input } = renderAndOpen();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeLabel(input)).toContain('1 George St');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeLabel(input)).toContain('2 Collins St');

    // Already last — does not wrap.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeLabel(input)).toContain('2 Collins St');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeLabel(input)).toContain('1 George St');
  });

  it('jumps with Home and End', () => {
    const { input } = renderAndOpen();

    fireEvent.keyDown(input, { key: 'End' });
    expect(activeLabel(input)).toContain('2 Collins St');

    fireEvent.keyDown(input, { key: 'Home' });
    expect(activeLabel(input)).toContain('1 George St');
  });

  it('selects the active suggestion with Enter', () => {
    const { input, onSelect } = renderAndOpen();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // fireEvent returns !defaultPrevented — false proves preventDefault ran.
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(suggestions[1]);
    expect(notPrevented).toBe(false);
  });

  it('does not guess on Enter without an active suggestion', () => {
    const { input, onSelect } = renderAndOpen();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape and consumes it so an enclosing dialog stays open', () => {
    // This input sits inside the property form drawer, which closes on Escape
    // from a document listener. Dismissing suggestions must not discard the form.
    const onDocumentEscape = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDocumentEscape();
    };
    document.addEventListener('keydown', listener);
    try {
      const { input } = renderAndOpen();
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onDocumentEscape).not.toHaveBeenCalled();

      // The release direction: with the list closed, Escape is no longer ours.
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onDocumentEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('releases the focused label style when focus leaves after Escape', () => {
    const { input } = renderAndOpen();
    fireEvent.keyDown(input, { key: 'Escape' });

    fireEvent.blur(input);

    // The label must not stay in its focused style on an empty, unfocused field.
    expect(screen.getByText('Address').className).not.toContain('text-primary');
  });

  it('closes the list on Tab', () => {
    const { input } = renderAndOpen();
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    fireEvent.keyDown(input, { key: 'Tab' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('never activates the status row', () => {
    mockUseAddressSuggestions.mockReturnValue({ data: [], isLoading: false });
    const { input } = renderInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ab' } });

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByText('Type at least 3 characters to search')).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('drops a stale active index when the suggestions change', () => {
    const { input, rerenderWith } = (() => {
      const api = renderAndOpen();
      return {
        ...api,
        rerenderWith: (next: AddressLookupSuggestion[]) => {
          mockUseAddressSuggestions.mockReturnValue({ data: next, isLoading: false });
          fireEvent.change(api.input, { target: { value: 'collins' } });
        },
      };
    })();

    fireEvent.keyDown(input, { key: 'End' });
    expect(activeLabel(input)).toContain('2 Collins St');

    // A new result set must not leave the index pointing at a row that moved.
    rerenderWith([suggestions[1]!]);
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });
});
