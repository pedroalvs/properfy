import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSetSearch = vi.fn();
const mockReset = vi.fn();
const mockResults: any[] = [];
let mockSearchValue = '';

vi.mock('../hooks/useContactSearch', () => ({
  useContactSearch: () => ({
    search: mockSearchValue,
    debouncedSearch: mockSearchValue,
    results: mockResults,
    isSearching: false,
    setSearch: mockSetSearch,
    reset: mockReset,
  }),
}));

import { ContactAutocomplete } from './ContactAutocomplete';

describe('ContactAutocomplete', () => {
  const onSelect = vi.fn();
  const onClear = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchValue = '';
    mockResults.length = 0;
  });

  it('renders with placeholder', () => {
    render(
      <ContactAutocomplete
        value=""
        onSelect={onSelect}
        onClear={onClear}
        placeholder="Search contacts..."
        aria-label="Search"
      />,
    );
    expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument();
  });

  it('opens dropdown on focus', () => {
    render(
      <ContactAutocomplete
        value=""
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Start typing to search contacts')).toBeInTheDocument();
  });

  it('shows results when available', () => {
    mockResults.push(
      { id: 'c-1', displayName: 'John Doe', primaryEmail: 'john@test.com', primaryPhone: null, type: 'RENTAL_TENANT', isActive: true },
    );
    mockSearchValue = 'John';

    render(
      <ContactAutocomplete
        value=""
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('calls onSelect when a contact is clicked', () => {
    const contact = { id: 'c-1', displayName: 'John Doe', primaryEmail: 'john@test.com', primaryPhone: null, type: 'RENTAL_TENANT', isActive: true };
    mockResults.push(contact);
    mockSearchValue = 'John';

    render(
      <ContactAutocomplete
        value=""
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('John Doe'));

    expect(onSelect).toHaveBeenCalledWith(contact);
    expect(mockReset).toHaveBeenCalled();
  });

  it('shows clear button when a contact is selected', () => {
    render(
      <ContactAutocomplete
        value="John Doe"
        selectedContactId="c-1"
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    expect(screen.getByLabelText('Clear contact selection')).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', () => {
    render(
      <ContactAutocomplete
        value="John Doe"
        selectedContactId="c-1"
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    fireEvent.click(screen.getByLabelText('Clear contact selection'));
    expect(onClear).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('delegates search input changes to setSearch', () => {
    render(
      <ContactAutocomplete
        value=""
        onSelect={onSelect}
        onClear={onClear}
        aria-label="Search"
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test' } });
    expect(mockSetSearch).toHaveBeenCalledWith('test');
  });
});

/**
 * Keyboard access. Same gap the SelectInput had: the suggestions were
 * <li onClick> with no key handling, so they could not be reached without a
 * mouse. This is a combobox, so the active suggestion is published through
 * aria-activedescendant while focus stays in the text input.
 */
describe('ContactAutocomplete keyboard navigation', () => {
  const onSelect = vi.fn();
  const onClear = vi.fn();

  const contacts = [
    { id: 'c1', displayName: 'Alice Smith', type: 'RENTAL_TENANT', primaryEmail: 'a@x.com', primaryPhone: null },
    { id: 'c2', displayName: 'Bob Jones', type: 'PROPERTY_MANAGER', primaryEmail: null, primaryPhone: null },
    { id: 'c3', displayName: 'Cara Lee', type: 'BROKER', primaryEmail: null, primaryPhone: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchValue = 'ali';
    mockResults.length = 0;
    mockResults.push(...contacts);
  });

  function renderAndOpen() {
    render(
      <ContactAutocomplete value="" onSelect={onSelect} onClear={onClear} aria-label="Search" />,
    );
    const input = screen.getByLabelText('Search');
    fireEvent.focus(input);
    return input;
  }

  function activeLabel(input: HTMLElement) {
    const id = input.getAttribute('aria-activedescendant');
    return id ? document.getElementById(id)?.textContent : null;
  }

  it('links the input to the suggestion list', () => {
    const input = renderAndOpen();
    const listboxId = screen.getByRole('listbox').getAttribute('id');
    expect(listboxId).toBeTruthy();
    expect(input).toHaveAttribute('aria-controls', listboxId!);
  });

  it('moves through suggestions with the arrow keys', () => {
    const input = renderAndOpen();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeLabel(input)).toContain('Alice Smith');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeLabel(input)).toContain('Bob Jones');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeLabel(input)).toContain('Alice Smith');

    // Clamped at the first suggestion rather than wrapping around.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeLabel(input)).toContain('Alice Smith');
  });

  it('jumps to the first and last suggestion with Home and End', () => {
    const input = renderAndOpen();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'End' });
    expect(activeLabel(input)).toContain('Cara Lee');

    fireEvent.keyDown(input, { key: 'Home' });
    expect(activeLabel(input)).toContain('Alice Smith');
  });

  it('selects the active suggestion with Enter', () => {
    const input = renderAndOpen();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });

  it('does nothing on Enter when no suggestion is active', () => {
    const input = renderAndOpen();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('consumes Escape so an enclosing dialog does not close too', () => {
    // The PM-contact field lives inside the bulk-edit dialog, which closes on
    // Escape from a document listener.
    const onDocumentEscape = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDocumentEscape();
    };
    document.addEventListener('keydown', listener);
    try {
      const input = renderAndOpen();
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onDocumentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('does not mark the status messages as selectable options', () => {
    mockResults.length = 0;
    mockSearchValue = 'a';
    render(
      <ContactAutocomplete value="" onSelect={onSelect} onClear={onClear} aria-label="Search" />,
    );
    fireEvent.focus(screen.getByLabelText('Search'));

    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();
    // A hint is not an option; arrowing must never land on it.
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
