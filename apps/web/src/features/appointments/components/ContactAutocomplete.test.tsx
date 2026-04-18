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
      { id: 'c-1', displayName: 'John Doe', primaryEmail: 'john@test.com', primaryPhone: null, type: 'TENANT', isActive: true },
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
    const contact = { id: 'c-1', displayName: 'John Doe', primaryEmail: 'john@test.com', primaryPhone: null, type: 'TENANT', isActive: true };
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
