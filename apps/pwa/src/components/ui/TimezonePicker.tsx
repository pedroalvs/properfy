import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getTimezoneOptions,
  normalizeTimezoneQuery,
  type TimezoneOption,
} from '@properfy/shared';

interface TimezonePickerProps {
  /** Selected IANA identifier, or null/'' when nothing is selected. */
  value: string | null;
  /** Receives the IANA id, or '' when the clear row is picked (allowClear). */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** Renders a pinned first row that clears the selection (onChange('')). */
  allowClear?: boolean;
  /** Label for the clear row. */
  clearLabel?: string;
}

/** `City (GMT+x)` label for a picker option. */
export function formatTimezoneOptionLabel(option: TimezoneOption): string {
  return `${option.city} (${option.offsetLabel})`;
}

/** `City (GMT+x)` label for an IANA id; falls back to the raw id when unknown. */
export function formatTimezoneLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const option = getTimezoneOptions().find((o) => o.value === value);
  return option ? formatTimezoneOptionLabel(option) : value;
}

/**
 * Mobile-first timezone selector: a field-styled trigger that opens a
 * full-screen searchable list. Options come from the shared memoized catalog
 * (Australia region pinned first).
 */
export function TimezonePicker({
  value,
  onChange,
  placeholder = 'Select timezone',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  allowClear = false,
  clearLabel = 'Platform default (Sydney)',
}: TimezonePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => getTimezoneOptions(), []);
  const selectedLabel = value ? formatTimezoneLabel(value) : null;

  const filtered = useMemo(() => {
    const normalized = normalizeTimezoneQuery(query);
    if (!normalized) return options;
    return options.filter((option) => option.searchText.includes(normalized));
  }, [options, query]);

  /** Options grouped by region, in catalog order (Australia first). */
  const groups = useMemo(() => {
    const result: { region: string; options: TimezoneOption[] }[] = [];
    for (const option of filtered) {
      const last = result[result.length - 1];
      if (last && last.region === option.region) {
        last.options.push(option);
      } else {
        result.push({ region: option.region, options: [option] });
      }
    }
    return result;
  }, [filtered]);

  const close = () => {
    setIsOpen(false);
    setQuery('');
  };

  const handleSelect = (next: string) => {
    onChange(next);
    close();
  };

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Lock body scroll while the full-screen overlay is open.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-black/10 bg-slate-50 px-3 py-2.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-real-estate/30 disabled:opacity-50"
        data-testid="timezone-picker-trigger"
      >
        <span className={selectedLabel ? 'truncate text-text-primary' : 'truncate text-text-muted'}>
          {selectedLabel ?? placeholder}
        </span>
        <i className="mdi mdi-chevron-down shrink-0 text-base text-text-muted" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-label="Select timezone"
          data-testid="timezone-picker-overlay"
        >
          <div
            className="sticky top-0 z-10 border-b border-black/5 bg-white px-4 pb-3"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex min-h-[52px] items-center justify-between gap-2">
              <p className="text-base font-bold text-text-primary">Select timezone</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary"
              >
                <i className="mdi mdi-close text-xl" aria-hidden="true" />
              </button>
            </div>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or region"
              aria-label="Search timezones"
              className="w-full rounded-xl border border-black/10 bg-slate-50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-real-estate/30"
            />
          </div>

          <div className="flex-1 overflow-y-auto pb-safe-b" role="listbox" aria-label="Timezones">
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => handleSelect('')}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-black/5 px-4 py-2.5 text-left"
                data-testid="timezone-option-clear"
              >
                <span className={`truncate text-sm ${!value ? 'font-bold text-real-estate' : 'text-text-primary'}`}>
                  {clearLabel}
                </span>
                {!value && (
                  <i className="mdi mdi-check shrink-0 text-base text-real-estate" aria-hidden="true" />
                )}
              </button>
            )}
            {groups.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text-muted">No timezones match</p>
            )}
            {groups.map((group) => (
              <div key={group.region}>
                <div
                  role="presentation"
                  className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted"
                >
                  {group.region}
                </div>
                {group.options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      onClick={() => handleSelect(option.value)}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
                      aria-selected={isSelected}
                      data-testid={`timezone-option-${option.value}`}
                    >
                      <span
                        className={`truncate text-sm ${isSelected ? 'font-bold text-real-estate' : 'text-text-primary'}`}
                      >
                        {option.city}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                        {option.offsetLabel}
                        {isSelected && (
                          <i className="mdi mdi-check text-base text-real-estate" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
