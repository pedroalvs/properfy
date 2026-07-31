import { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  filterContainer,
  filterLabel,
  filterLabelFocused,
  filterIcon,
  filterClearButton,
  filterDropdown,
  filterOption,
  filterOptionActive,
  filterOptionHighlighted,
  filterOptionHighlightedActive,
} from './filter-styles';

export interface FilterMultiSelectOption {
  label: string;
  value: string;
}

interface FilterMultiSelectProps {
  label: string;
  /** Array of selected option `value`s (empty array = no selection). */
  value: string[];
  onChange: (next: string[]) => void;
  options: FilterMultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Multi-select filter dropdown matching the visual contract of `FilterSelect`
 * (single-line trigger height, floating dropdown, outlined+dense Vuetify
 * lookalike). Differences vs `FilterSelect`:
 *
 *   - `value` is a `string[]`; `onChange` returns the next array.
 *   - Clicking an option toggles it in place — the dropdown stays open so
 *     users can pick several before clicking outside to commit.
 *   - Trigger summary mirrors the most informative state:
 *       * empty selection → placeholder/label (no chip);
 *       * one selection  → that option's label verbatim;
 *       * many selection → "N selected".
 *   - A clear (×) chip appears whenever the selection is non-empty, the
 *     same affordance `FilterSelect` uses for single-select clear.
 *   - Listbox is announced as `aria-multiselectable`; each option exposes
 *     `aria-selected` so screen readers track the running selection.
 */
export function FilterMultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  /**
   * Index of the keyboard-active option, published via `aria-activedescendant`.
   * Stays -1 when there are no options, so the non-option "No options" row can
   * never become the active descendant.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const selectedSet = useMemo(() => new Set(value), [value]);
  const triggerSummary = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      return options.find((o) => o.value === value[0])?.label ?? '1 selected';
    }
    return `${value.length} selected`;
  }, [value, options]);
  const showFloatingLabel = focused || open || value.length > 0;

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(options.length > 0 ? 0 : -1);
    setOpen(true);
    setFocused(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A background refetch can shrink the list under an open menu, leaving the
  // index past the end. Both combobox ports guard this; the listboxes did not.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? -1 : i));
  }, [options.length]);

  // Keep the active option inside the scrolling menu while arrowing past its
  // edges. Queried by role because the "No options" row is not an option.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [open, activeIndex]);

  function toggleOption(optionValue: string) {
    if (selectedSet.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Guarded: with no options `Math.max(-2, 0)` is 0, which would point
        // aria-activedescendant at an id that does not exist over the
        // "No options" row.
        setActiveIndex((i) => (options.length === 0 ? -1 : Math.max(i - 1, 0)));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(options.length > 0 ? 0 : -1);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ': {
        // Toggle in place. Unlike a single-select, the menu stays open so the
        // user can pick several before leaving — that is the whole affordance.
        e.preventDefault();
        const option = options[activeIndex];
        if (option) toggleOption(option.value);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // Consume it, or an enclosing Dialog closes along with the menu.
        e.stopPropagation();
        closeMenu();
        break;
      case 'Tab':
        closeMenu();
        setFocused(false);
        break;
      default:
        break;
    }
  };

  const optionClass = (index: number, isSelected: boolean) => {
    if (index === activeIndex) {
      return isSelected ? filterOptionHighlightedActive : filterOptionHighlighted;
    }
    return isSelected ? filterOptionActive : filterOption;
  };

  return (
    <div
      ref={containerRef}
      className={`${filterContainer} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-disabled={disabled}
    >
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-[7px] text-sm"
        onClick={() => {
          if (disabled) return;
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (!open) setFocused(false);
        }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-disabled={disabled}
        disabled={disabled}
      >
        <span className={triggerSummary ? 'text-text-primary' : 'text-text-muted'}>
          {triggerSummary ?? (showFloatingLabel ? placeholder || '' : label)}
        </span>
        <div className="flex items-center gap-1">
          {value.length > 0 && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
                closeMenu();
                setFocused(false);
              }}
              className={filterClearButton}
              aria-label={`Clear ${label}`}
            >
              <i className="mdi mdi-close text-sm" />
            </span>
          )}
          <i className={`mdi mdi-menu-down ${filterIcon} transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && !disabled && (
        <ul
          ref={listRef}
          id={listboxId}
          className={filterDropdown}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
        >
          {options.length === 0 ? (
            <li className={`${filterOption} cursor-default text-text-muted`} role="presentation">
              No options
            </li>
          ) : (
            options.map((opt, index) => {
              const selected = selectedSet.has(opt.value);
              return (
                <li
                  key={opt.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  className={`${optionClass(index, selected)} flex items-center gap-2`}
                  onClick={() => toggleOption(opt.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <i
                    aria-hidden="true"
                    className={`mdi ${selected ? 'mdi-checkbox-marked text-primary' : 'mdi-checkbox-blank-outline text-text-muted'} text-base`}
                  />
                  <span className="flex-1">{opt.label}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
