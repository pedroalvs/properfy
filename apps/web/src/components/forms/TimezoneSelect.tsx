import { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  getTimezoneOptions,
  normalizeTimezoneQuery,
  type TimezoneOption,
} from '@properfy/shared';
import {
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
  formInput,
  formDropdown,
  formDropdownAbove,
  formOption,
  formOptionActive,
} from './form-styles';
import {
  clippingRect,
  resolveDropdownPlacement,
  type DropdownPlacement,
} from './dropdown-placement';

interface TimezoneSelectProps {
  /** Selected IANA timezone, or null/'' when unset. */
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

function optionLabel(option: TimezoneOption): string {
  return `${option.city} (${option.offsetLabel})`;
}

/** Closed-state label for a value with no matching option (stale tzdb name). */
function fallbackLabel(value: string): string {
  const city = value.split('/').pop() ?? value;
  return city.replace(/_/g, ' ');
}

interface OptionGroup {
  region: string;
  /** Flat index of the group's first option, for stable option ids. */
  startIndex: number;
  options: TimezoneOption[];
}

/**
 * Searchable timezone combobox over `getTimezoneOptions()`, following the
 * ContactAutocomplete keyboard contract: focus stays on the input, the active
 * option travels via `aria-activedescendant`, and group headers are
 * presentational rows that the active index can never land on.
 *
 * Filtering is synchronous and local (~400 options), so there is no debounce
 * and no loading state.
 */
export function TimezoneSelect({
  value,
  onChange,
  placeholder = 'Search timezones...',
  disabled,
  error,
  id,
  'aria-label': ariaLabel = 'Timezone',
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** Index of the keyboard-active option over the FLAT filtered list — group
   *  headers are excluded. -1 means nothing is active yet. */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${id ?? reactId}-timezone-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const allOptions = useMemo(() => getTimezoneOptions(), []);
  const selectedOption = useMemo(
    () => (value ? allOptions.find((o) => o.value === value) : undefined),
    [allOptions, value],
  );

  const filtered = useMemo(() => {
    const query = normalizeTimezoneQuery(search);
    if (!query) return allOptions;
    return allOptions.filter((o) => o.searchText.includes(query));
  }, [allOptions, search]);

  const groups = useMemo(() => {
    const out: OptionGroup[] = [];
    for (const option of filtered) {
      const last = out[out.length - 1];
      if (last && last.region === option.region) {
        last.options.push(option);
      } else {
        out.push({
          region: option.region,
          startIndex: (last?.startIndex ?? 0) + (last?.options.length ?? 0),
          options: [option],
        });
      }
    }
    return out;
  }, [filtered]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Measure the space available at open time, exactly as SelectInput does, so
   *  the menu is not clipped by an enclosing scroll container. */
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
    setSearch('');
  };

  const handleSelect = (option: TimezoneOption) => {
    onChange(option.value);
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
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case 'Enter': {
        // Only acts on an explicitly active option; a bare Enter must stay
        // free for the surrounding form to handle.
        const option = filtered[activeIndex];
        if (!option) return;
        e.preventDefault();
        handleSelect(option);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it: Dialog and DrawerPanel close on Escape from a document
        // listener, and dismissing the menu must not dismiss the modal.
        e.stopPropagation();
        closeList();
        break;
      case 'Tab':
        closeList();
        break;
      default:
        break;
    }
  };

  // Reset the active option when the filter changes: the index would otherwise
  // point at a different (or absent) row.
  useEffect(() => {
    setActiveIndex(-1);
  }, [search, filtered.length]);

  // Keep the active option inside the scrolling list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [open, activeIndex]);

  const displayValue = open
    ? search
    : value
      ? selectedOption
        ? optionLabel(selectedOption)
        : fallbackLabel(value)
      : '';

  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div ref={containerRef} className="relative">
      <div className={containerClass}>
        <div className="flex items-center">
          <i className="mdi mdi-magnify text-text-muted ml-3 mr-1 text-base" aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
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
              if (!open) openList();
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
          {value && !open && !disabled && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              className="mr-2 text-text-muted hover:text-text-primary transition-colors"
              aria-label="Clear timezone selection"
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
          aria-label={`${ariaLabel} options`}
        >
          {filtered.length === 0 ? (
            <li role="presentation" aria-live="polite" className="px-3 py-2 text-sm text-text-muted">
              No timezones found
            </li>
          ) : (
            groups.map((group) => (
              <li key={group.region} role="presentation">
                <div
                  role="presentation"
                  className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-text-muted"
                >
                  {group.region}
                </div>
                <ul role="presentation" className="m-0 list-none p-0">
                  {group.options.map((option, indexInGroup) => {
                    const flatIndex = group.startIndex + indexInGroup;
                    return (
                      <li
                        key={option.value}
                        id={optionId(flatIndex)}
                        role="option"
                        aria-selected={option.value === value}
                        className={
                          option.value === value || flatIndex === activeIndex
                            ? formOptionActive
                            : formOption
                        }
                        onClick={() => handleSelect(option)}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                      >
                        {optionLabel(option)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
