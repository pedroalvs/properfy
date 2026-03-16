import { useState, useEffect, useRef } from 'react';
import { filterContainer, filterInput, filterLabel, filterLabelFocused, filterIcon } from './filter-styles';

interface FilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  debounceMs = 300,
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
      onChange(newValue);
    }, debounceMs);
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={label}
        />
      </div>
    </div>
  );
}
