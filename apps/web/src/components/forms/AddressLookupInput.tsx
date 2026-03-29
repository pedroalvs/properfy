import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAddressSuggestions } from '@/features/properties/hooks/useAddressSuggestions';
import type { AddressLookupSuggestion } from '@/lib/address';
import {
  filterContainer,
  filterDropdown,
  filterIcon,
  filterLabel,
  filterLabelFocused,
  filterOption,
} from '@/components/filters/filter-styles';

interface AddressLookupInputProps {
  label: string;
  valueLabel: string;
  onSelect: (suggestion: AddressLookupSuggestion) => void;
  onClear: () => void;
  country?: string;
  /** Appended to the user's search text to narrow results geographically (e.g., "Bahia Brazil") */
  searchContext?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function AddressLookupInput({
  label,
  valueLabel,
  onSelect,
  onClear,
  country,
  searchContext,
  placeholder = 'Search address...',
  disabled = false,
  ariaLabel,
}: AddressLookupInputProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const enrichedSearch = searchContext && debouncedSearch
    ? `${debouncedSearch} ${searchContext}`
    : debouncedSearch;

  const { data: options = [], isLoading } = useAddressSuggestions(
    enrichedSearch,
    !disabled,
    country,
  );

  const showFloatingLabel = focused || open || search !== '' || valueLabel !== '';
  const renderedValue = open ? search : valueLabel;

  const statusMessage = useMemo(() => {
    if (search.length > 0 && search.length < 3) return 'Type at least 3 characters to search';
    if (isLoading) return 'Searching...';
    if (debouncedSearch.length >= 3 && options.length === 0) return 'No verified addresses found';
    return country
      ? `Search for a verified address in ${country}`
      : 'Search for a verified address';
  }, [country, debouncedSearch.length, isLoading, options.length, search.length]);

  const handleSearchChange = useCallback((nextValue: string) => {
    setSearch(nextValue);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(nextValue);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setFocused(false);
        setSearch('');
        setDebouncedSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={filterContainer}>
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <div className="flex items-center px-3">
        <i className={`mdi mdi-map-marker-search ${filterIcon} mr-2`} />
        <input
          type="text"
          autoComplete="off"
          className="w-full bg-transparent py-[7px] text-sm text-text-primary outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
          placeholder={showFloatingLabel ? placeholder : label}
          value={renderedValue}
          disabled={disabled}
          onChange={(event) => {
            handleSearchChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setFocused(true);
            setOpen(true);
            setSearch('');
            setDebouncedSearch('');
          }}
          aria-label={ariaLabel ?? label}
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
        {valueLabel && !disabled && (
          <button
            type="button"
            className="ml-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label={`Clear ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
              setSearch('');
              setDebouncedSearch('');
              setOpen(false);
              setFocused(false);
            }}
          >
            <i className="mdi mdi-close text-base" />
          </button>
        )}
      </div>

      {open && !disabled && (
        <ul className={filterDropdown} role="listbox" aria-label={label}>
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">{statusMessage}</li>
          ) : (
            options.map((option) => (
              <li
                key={`${option.formattedAddress}-${option.latitude}-${option.longitude}`}
                role="option"
                className={filterOption}
                onClick={() => {
                  onSelect(option);
                  setSearch('');
                  setDebouncedSearch('');
                  setOpen(false);
                  setFocused(false);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{option.formattedAddress}</span>
                  <span className="text-xs text-text-muted">
                    {option.suburb}, {option.state} {option.postcode}
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
