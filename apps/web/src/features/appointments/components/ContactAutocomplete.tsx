import { useState, useRef, useEffect } from 'react';
import {
  formInputContainer,
  formInput,
  formDropdown,
  formOption,
  formOptionActive,
} from '@/components/forms/form-styles';
import { useContactSearch, type ContactSearchResult } from '../hooks/useContactSearch';

interface ContactAutocompleteProps {
  value: string;
  selectedContactId?: string;
  onSelect: (contact: ContactSearchResult) => void;
  onClear: () => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

function formatContactType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function ContactAutocomplete({
  value,
  selectedContactId,
  onSelect,
  onClear,
  placeholder = 'Search contacts...',
  disabled,
  'aria-label': ariaLabel = 'Search contacts',
}: ContactAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { search, debouncedSearch, results, isSearching, setSearch, reset } =
    useContactSearch(!disabled);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!selectedContactId) reset();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedContactId, reset]);

  const handleSelect = (contact: ContactSearchResult) => {
    onSelect(contact);
    reset();
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    reset();
    inputRef.current?.focus();
  };

  const displayValue = open ? search : (selectedContactId ? value : '');

  return (
    <div ref={containerRef} className="relative">
      <div className={formInputContainer}>
        <div className="flex items-center">
          <i className="mdi mdi-magnify text-text-muted ml-3 mr-1 text-base" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className={formInput}
            value={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (selectedContactId) setSearch('');
            }}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            role="combobox"
            aria-autocomplete="list"
            autoComplete="off"
          />
          {selectedContactId && !open && (
            <button
              type="button"
              onClick={handleClear}
              className="mr-2 text-text-muted hover:text-text-primary transition-colors"
              aria-label="Clear contact selection"
            >
              <i className="mdi mdi-close text-base" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <ul className={formDropdown} role="listbox" aria-label={ariaLabel}>
          {search.length > 0 && search.length < 2 ? (
            <li className="px-3 py-2 text-sm text-text-muted">
              Type at least 2 characters to search
            </li>
          ) : isSearching ? (
            <li className="px-3 py-2 text-sm text-text-muted">Searching...</li>
          ) : debouncedSearch.length >= 2 && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">
              No contacts found
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">
              Start typing to search contacts
            </li>
          ) : (
            results.map((contact) => (
              <li
                key={contact.id}
                role="option"
                aria-selected={contact.id === selectedContactId}
                className={contact.id === selectedContactId ? formOptionActive : formOption}
                onClick={() => handleSelect(contact)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{contact.displayName}</span>
                  <span className="text-xs text-text-muted">
                    {formatContactType(contact.type)}
                    {contact.primaryEmail && ` \u00B7 ${contact.primaryEmail}`}
                    {contact.primaryPhone && ` \u00B7 ${contact.primaryPhone}`}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
