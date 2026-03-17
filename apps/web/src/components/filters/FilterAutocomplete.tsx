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

export interface FilterAutocompleteOption {
  label: string;
  value: string;
}

interface FilterAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterAutocompleteOption[];
  placeholder?: string;
}

export function FilterAutocomplete({
  label,
  value,
  onChange,
  options,
  placeholder,
}: FilterAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';
  const showFloatingLabel = focused || open || value !== '' || search !== '';

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        if (!value) setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  return (
    <div ref={containerRef} className={filterContainer}>
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <div className="flex items-center px-3">
        <i className={`mdi mdi-magnify ${filterIcon} mr-2`} />
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          placeholder={showFloatingLabel ? placeholder || '' : label}
          value={open ? search : selectedLabel}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
            setSearch('');
          }}
          onBlur={() => {
            if (!open) setFocused(false);
          }}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
      </div>

      {open && (
        <ul className={filterDropdown} role="listbox" aria-label={label}>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No results</li>
          ) : (
            filtered.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={opt.value === value ? filterOptionActive : filterOption}
                onClick={() => {
                  onChange(opt.value);
                  setSearch('');
                  setOpen(false);
                  setFocused(false);
                }}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
