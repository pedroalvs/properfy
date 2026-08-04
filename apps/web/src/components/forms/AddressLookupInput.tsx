import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAddressSuggestions } from '@/features/properties/hooks/useAddressSuggestions';
import type { AddressLookupSuggestion } from '@/lib/address';
import {
  filterContainer,
  filterDropdown,
  filterIcon,
  filterLabel,
  filterLabelFocused,
  filterOption,
  filterOptionHighlighted,
} from '@/components/filters/filter-styles';

interface AddressLookupInputProps {
  label: string;
  valueLabel: string;
  onSelect: (suggestion: AddressLookupSuggestion) => void;
  onClear: () => void;
  country?: string;
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
  placeholder = 'Search address...',
  disabled = false,
  ariaLabel,
}: AddressLookupInputProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /**
   * Index of the keyboard-active suggestion, published through
   * `aria-activedescendant`. -1 means "none" — the status row is not an option
   * and must never become the active descendant.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const { data: options = [], isLoading } = useAddressSuggestions(
    debouncedSearch,
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

  // A stale index would point at an address the user can no longer see.
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedSearch, options.length]);

  // Queried by role: the status row shares the list but is not an option.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [open, activeIndex]);

  const closeList = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const selectSuggestion = (suggestion: AddressLookupSuggestion) => {
    onSelect(suggestion);
    setSearch('');
    setDebouncedSearch('');
    closeList();
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (options.length === 0) return;
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter': {
        // Only acts on an explicitly active suggestion; a bare Enter must stay
        // free for the surrounding form to handle.
        const option = options[activeIndex];
        if (!option) return;
        e.preventDefault();
        selectSuggestion(option);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it: the enclosing property drawer closes on Escape from a
        // document listener, and dismissing suggestions must not discard it.
        e.stopPropagation();
        closeList();
        break;
      case 'Tab':
        closeList();
        setFocused(false);
        break;
      default:
        break;
    }
  };

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
          onBlur={() => {
            // Without this the floating label stays in its focused style after
            // Escape-then-Tab: the keydown early-returns while closed, so
            // nothing else resets `focused`. FilterSelect has the same guard.
            if (!open) setFocused(false);
          }}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel ?? label}
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={open && !disabled ? listboxId : undefined}
          aria-activedescendant={
            open && !disabled && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
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
        <ul ref={listRef} id={listboxId} className={filterDropdown} role="listbox" aria-label={label}>
          {options.length === 0 ? (
            // Announced but never navigable — it is not an option.
            <li className="px-3 py-2 text-sm text-text-muted" role="presentation" aria-live="polite">
              {statusMessage}
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={`${option.formattedAddress}-${option.latitude}-${option.longitude}`}
                id={optionId(index)}
                role="option"
                aria-selected={false}
                className={index === activeIndex ? filterOptionHighlighted : filterOption}
                onClick={() => selectSuggestion(option)}
                onMouseEnter={() => setActiveIndex(index)}
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
