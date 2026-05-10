import { useState, useRef, useEffect, useMemo } from 'react';
import {
  filterContainer,
  filterLabel,
  filterLabelFocused,
  filterIcon,
  filterClearButton,
  filterDropdown,
  filterOption,
  filterOptionActive,
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
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const triggerSummary = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      return options.find((o) => o.value === value[0])?.label ?? '1 selected';
    }
    return `${value.length} selected`;
  }, [value, options]);
  const showFloatingLabel = focused || open || value.length > 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleOption(optionValue: string) {
    if (selectedSet.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

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
          setOpen(!open);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (!open) setFocused(false);
        }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
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
                setOpen(false);
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
            options.map((opt) => {
              const selected = selectedSet.has(opt.value);
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  className={`${selected ? filterOptionActive : filterOption} flex items-center gap-2`}
                  onClick={() => toggleOption(opt.value)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleOption(opt.value);
                    }
                  }}
                  tabIndex={0}
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
