import { useState, useRef, useEffect } from 'react';
import {
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
  formSelectTrigger,
  formDropdown,
  formOption,
  formOptionActive,
} from './form-styles';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: SelectInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div ref={containerRef} className={containerClass}>
      <button
        type="button"
        id={id}
        className={formSelectTrigger}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={selectedLabel ? 'text-text-primary' : 'text-text-muted'}>
          {selectedLabel ?? placeholder ?? ''}
        </span>
        <i
          className={`mdi mdi-chevron-down text-text-muted text-lg transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul className={formDropdown} role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={opt.value === value ? formOptionActive : formOption}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
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
