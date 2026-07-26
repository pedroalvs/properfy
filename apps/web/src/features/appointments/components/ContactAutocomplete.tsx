import { useState, useRef, useEffect, useId } from 'react';
import {
  formInputContainer,
  formInput,
  formDropdown,
  formDropdownAbove,
  formOption,
  formOptionActive,
} from '@/components/forms/form-styles';
import {
  clippingRect,
  resolveDropdownPlacement,
  type DropdownPlacement,
} from '@/components/forms/dropdown-placement';
import { useContactSearch, type ContactSearchResult } from '../hooks/useContactSearch';
import { formatAuPhone } from '@/lib/phone-mask';

interface ContactAutocompleteProps {
  value: string;
  selectedContactId?: string;
  onSelect: (contact: ContactSearchResult) => void;
  onClear: () => void;
  placeholder?: string;
  disabled?: boolean;
  tenantId?: string;
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
  tenantId,
  'aria-label': ariaLabel = 'Search contacts',
}: ContactAutocompleteProps) {
  const [open, setOpen] = useState(false);
  /**
   * Index of the keyboard-active suggestion, over `results` only — the status
   * messages ("Searching...", "No contacts found") are not options and must
   * never be landed on. -1 means nothing is active yet, so a bare Enter does
   * not silently pick the first row.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = `${useId()}-contact-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const { search, debouncedSearch, results, isSearching, setSearch, reset } =
    useContactSearch(!disabled, tenantId);

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

  /** Measure the space available at open time, exactly as SelectInput does, so
   *  the suggestions are not clipped by an enclosing scroll container. */
  const openList = () => {
    if (containerRef.current) {
      const trigger = containerRef.current.getBoundingClientRect();
      const clip = clippingRect(containerRef.current);
      const layout = resolveDropdownPlacement({
        triggerTop: trigger.top,
        triggerBottom: trigger.bottom,
        clipTop: clip.top,
        clipBottom: clip.bottom,
      });
      setPlacement(layout.placement);
      setMaxHeight(layout.maxHeight);
    }
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleSelect = (contact: ContactSearchResult) => {
    onSelect(contact);
    reset();
    closeList();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openList();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (results.length === 0) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (results.length === 0) return;
        e.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case 'Enter': {
        // Only acts on an explicitly active suggestion; a bare Enter must not
        // guess, and must stay free for the surrounding form to handle.
        const contact = results[activeIndex];
        if (!contact) return;
        e.preventDefault();
        handleSelect(contact);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it: an enclosing Dialog closes on Escape from a document
        // listener, and dismissing suggestions must not dismiss the dialog.
        e.stopPropagation();
        closeList();
        if (!selectedContactId) reset();
        break;
      case 'Tab':
        closeList();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedSearch, results.length]);

  // Keep the active suggestion inside the scrolling list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [open, activeIndex]);

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
              if (!open) openList();
            }}
            onFocus={() => {
              openList();
              if (selectedContactId) setSearch('');
            }}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
        <ul
          ref={listRef}
          id={listboxId}
          className={placement === 'above' ? formDropdownAbove : formDropdown}
          style={maxHeight !== undefined ? { maxHeight } : undefined}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
        >
          {search.length > 0 && search.length < 2 ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              Type at least 2 characters to search
            </li>
          ) : isSearching ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">Searching...</li>
          ) : debouncedSearch.length >= 2 && results.length === 0 ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              No contacts found
            </li>
          ) : results.length === 0 ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              Start typing to search contacts
            </li>
          ) : (
            results.map((contact, index) => (
              <li
                key={contact.id}
                id={optionId(index)}
                role="option"
                aria-selected={contact.id === selectedContactId}
                className={
                  contact.id === selectedContactId || index === activeIndex
                    ? formOptionActive
                    : formOption
                }
                onClick={() => handleSelect(contact)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{contact.displayName}</span>
                  <span className="text-xs text-text-muted">
                    {formatContactType(contact.type)}
                    {contact.primaryEmail && ` \u00B7 ${contact.primaryEmail}`}
                    {contact.primaryPhone && ` \u00B7 ${formatAuPhone(contact.primaryPhone)}`}
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
