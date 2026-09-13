import { useState, useRef, useEffect, useId } from 'react';
import {
  formInputContainer,
  formInputContainerDisabled,
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
import { useDetailQuery } from '@/hooks/useApiQuery';
import { useAgencySearch, type AgencyOption } from '../hooks/useAgencySearch';

interface AgencySelectProps {
  /** Selected agency id, '' when none. */
  value: string;
  onChange: (tenantId: string) => void;
  /** Known name of the pre-selected agency, so it renders without a lookup. */
  initialLabel?: string;
  /** Gates the search query (e.g. only while the drawer is open). */
  enabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Searchable, server-side agency picker. Unlike a static `pageSize: 100` fetch,
 * this never silently hides agency #101+: an empty search shows the first 100
 * alphabetically with a "type to search" hint when more exist, and typing
 * narrows via the `/v1/tenants` `search` param. Keyboard behaviour is ported
 * from ContactAutocomplete / SelectInput (WAI-ARIA combobox).
 */
export function AgencySelect({
  value,
  onChange,
  initialLabel,
  enabled = true,
  placeholder = 'Select agency',
  disabled,
  'aria-label': ariaLabel = 'Agency',
}: AgencySelectProps) {
  const [open, setOpen] = useState(false);
  /**
   * Index of the keyboard-active option, over `results` only — the status and
   * "more agencies" rows are not options and must never be landed on. -1 means
   * nothing is active, so a bare Enter does not silently pick the first row.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedLabel, setSelectedLabel] = useState(initialLabel ?? '');
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = `${useId()}-agency-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const { search, debouncedSearch, results, total, isSearching, setSearch, reset } =
    useAgencySearch(enabled && open);

  // Resolve the label of a pre-selected agency we weren't handed a name for.
  const needsLabel = !!value && !selectedLabel;
  const { data: detail } = useDetailQuery<{ id: string; name: string }>(
    ['tenant', 'agency-label', value],
    `/v1/tenants/${value}`,
    { enabled: needsLabel },
  );

  useEffect(() => {
    if (initialLabel) setSelectedLabel(initialLabel);
  }, [initialLabel]);
  useEffect(() => {
    if (detail?.data?.name) setSelectedLabel(detail.data.name);
  }, [detail]);
  // The agency was cleared upstream (e.g. form reset) — drop the stale label.
  useEffect(() => {
    if (!value) setSelectedLabel('');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
        reset();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reset]);

  // Drop a stale active index whenever the result set changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedSearch, results.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [open, activeIndex]);

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

  const handleSelect = (agency: AgencyOption) => {
    onChange(agency.id);
    setSelectedLabel(agency.name);
    reset();
    closeList();
    inputRef.current?.blur();
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
        const agency = results[activeIndex];
        if (!agency) return;
        e.preventDefault();
        handleSelect(agency);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it: the enclosing DrawerPanel closes on Escape from a document
        // listener, and dismissing the list must not discard the whole form.
        e.stopPropagation();
        closeList();
        reset();
        break;
      case 'Tab':
        closeList();
        break;
      default:
        break;
    }
  };

  const displayValue = open ? search : selectedLabel;
  const showMoreHint = !isSearching && total > results.length;

  return (
    <div ref={containerRef} className="relative">
      <div className={disabled ? formInputContainerDisabled : formInputContainer}>
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
              if (value) setSearch('');
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
        </div>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className={placement === 'above' ? formDropdownAbove : formDropdown}
          style={maxHeight !== undefined ? { maxHeight } : undefined}
          role="listbox"
          aria-label={`${ariaLabel} options`}
        >
          {isSearching ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              Searching…
            </li>
          ) : results.length === 0 ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              No agencies found
            </li>
          ) : (
            <>
              {results.map((agency, index) => {
                const isSelected = agency.id === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={agency.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    // Keyboard-active vs selected must read differently (WCAG 2.4.7).
                    // The selected row already carries `bg-primary/10` (formOptionActive),
                    // so the active cursor uses an inset ring instead of another
                    // background — it stays visible even when it lands on the selected row.
                    className={`${isSelected ? formOptionActive : formOption}${isActive ? ' ring-2 ring-inset ring-primary' : ''} flex items-center justify-between`}
                    onClick={() => handleSelect(agency)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span>{agency.name}</span>
                    {isSelected && <i className="mdi mdi-check text-primary text-base" aria-hidden="true" />}
                  </li>
                );
              })}
              {showMoreHint && (
                <li
                  role="presentation"
                  aria-live="polite"
                  className="px-3 py-2 text-xs text-text-muted border-t border-black/5"
                >
                  Type to search more agencies
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
