import { useState, useRef, useEffect } from 'react';
import {
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
  formSelectTrigger,
  formDropdown,
  formDropdownAbove,
  formOption,
  formOptionActive,
} from './form-styles';
import { clippingRect, resolveDropdownPlacement, type DropdownPlacement } from './dropdown-placement';

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
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Decide placement at open time, from the space left inside whatever
   * actually clips the menu. Measuring here (rather than on every render)
   * keeps the common case free and avoids a visible reposition.
   */
  const toggleOpen = () => {
    if (disabled) return;
    if (!open && containerRef.current) {
      const trigger = containerRef.current.getBoundingClientRect();
      const clip = clippingRect(containerRef.current);
      setPlacement(
        resolveDropdownPlacement({
          triggerTop: trigger.top,
          triggerBottom: trigger.bottom,
          clipTop: clip.top,
          clipBottom: clip.bottom,
        }),
      );
    }
    setOpen(!open);
  };

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
        onClick={toggleOpen}
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
        <ul className={placement === "above" ? formDropdownAbove : formDropdown} role="listbox" aria-label={ariaLabel}>
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
