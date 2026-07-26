import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { filterContainer, filterInput, filterLabel, filterLabelFocused, filterIcon, filterClearButton } from './filter-styles';

interface FilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  /**
   * Fired when the operator presses Enter, AFTER any pending debounce has been
   * flushed — so a consumer that refetches off `onChange` is already acting on
   * the just-typed term by the time this runs.
   */
  onSubmit?: () => void;
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  debounceMs = 300,
  onSubmit,
}: FilterInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Clear BEFORE notifying so `timerRef` means "a change is still pending"
      // and nothing else — a fired timer must not look like a queued one.
      timerRef.current = undefined;
      onChange(newValue);
    }, debounceMs);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    // With an IME (CJK input), Enter commits the composition candidate rather
    // than meaning "submit" — acting on it would flush a half-composed term.
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    // A live timer is the only reliable "the parent has not seen this keystroke
    // yet" signal — comparing localValue to value would also fire when the
    // parent simply ignored or normalised an already-delivered change. Flush
    // before notifying, or the submit would act on the previous term.
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
      onChange(localValue);
    }
    onSubmit?.();
  };

  const handleClear = () => {
    setLocalValue('');
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    onChange('');
  };

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const showFloatingLabel = focused || localValue.length > 0;

  return (
    <div className={filterContainer}>
      {showFloatingLabel && (
        <span className={focused ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <div className="flex items-center px-3">
        <i className={`mdi mdi-magnify ${filterIcon} mr-2`} />
        <input
          type="text"
          className={filterInput}
          style={{ paddingLeft: 0 }}
          placeholder={showFloatingLabel ? placeholder : label}
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={label}
        />
        {localValue.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={filterClearButton}
            aria-label={`Clear ${label}`}
          >
            <i className="mdi mdi-close text-sm" />
          </button>
        )}
      </div>
    </div>
  );
}
