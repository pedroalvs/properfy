import { useState, useRef, useEffect } from 'react';
import {
  filterContainer,
  filterLabel,
  filterLabelFocused,
  filterIcon,
  filterDropdown,
  filterOption,
  filterOptionActive,
} from './filter-styles';

export interface FilterSelectOption {
  label: string;
  value: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  placeholder?: string;
}

export function FilterSelect({ label, value, onChange, options, placeholder }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label;
  const showFloatingLabel = focused || open || value !== '';

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

  return (
    <div ref={containerRef} className={`${filterContainer} cursor-pointer`}>
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm"
        onClick={() => {
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
      >
        <span className={selectedLabel ? 'text-text-primary' : 'text-text-muted'}>
          {selectedLabel ?? (showFloatingLabel ? placeholder || '' : label)}
        </span>
        <i className={`mdi mdi-menu-down ${filterIcon} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className={filterDropdown} role="listbox" aria-label={label}>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={opt.value === value ? filterOptionActive : filterOption}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
                setFocused(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
