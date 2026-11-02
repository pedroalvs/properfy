import { useState, useRef, useEffect, useId } from 'react';
import { cn } from '@properfy/frontend-standards';
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
import { useInspectorSearch, type InspectorOption } from '../hooks/useInspectorSearch';

interface InspectorSelectProps {
  /** Selected inspector id, '' when none. */
  value: string;
  onChange: (inspectorId: string) => void;
  /** Gates the search query (e.g. only while the section is mounted). */
  enabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Searchable, server-side ACTIVE-inspector picker for the route-weights preview
 * (L-F04-14). Ported from `AgencySelect` (WAI-ARIA combobox keyboard pattern);
 * never a `pageSize=100` fetch. The shared `SelectInput` is static-options only,
 * so this is feature-local rather than a change to that primitive.
 */
export function InspectorSelect({
  value,
  onChange,
  enabled = true,
  placeholder = 'Search inspectors',
  disabled,
  id,
  'aria-label': ariaLabel = 'Inspector',
}: InspectorSelectProps) {
  const [open, setOpen] = useState(false);
  /**
   * Index of the keyboard-active option, over `results` only. -1 means nothing
   * is active, so a bare Enter does not silently pick the first row.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${id ?? reactId}-inspector-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const { search, debouncedSearch, results, total, isSearching, setSearch, reset } =
    useInspectorSearch(enabled && open);

  // The inspector was cleared upstream (e.g. form reset) — drop the stale label.
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

  const handleSelect = (inspector: InspectorOption) => {
    onChange(inspector.id);
    setSelectedLabel(inspector.name);
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
        const inspector = results[activeIndex];
        if (!inspector) return;
        e.preventDefault();
        handleSelect(inspector);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it: an enclosing Dialog/DrawerPanel closes on Escape from a
        // document listener, and dismissing the list must not discard the form.
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
              No inspectors found
            </li>
          ) : (
            <>
              {results.map((inspector, index) => {
                const isSelected = inspector.id === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={inspector.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(isSelected ? formOptionActive : formOption, isActive && 'ring-2 ring-inset ring-primary', 'flex items-center justify-between')}
                    onClick={() => handleSelect(inspector)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span>{inspector.name}</span>
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
                  Type to search more inspectors
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
