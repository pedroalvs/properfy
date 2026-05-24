import { useRef } from 'react';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div
      className={containerClass}
      onClick={() => !disabled && (inputRef.current as any)?.showPicker?.()}
    >
      <input
        ref={inputRef}
        type="date"
        id={id}
        className={formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
