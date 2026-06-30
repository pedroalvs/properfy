import { useRef } from 'react';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** HH:mm lower bound — used to discourage picking a past start time when date = today. */
  min?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function TimeInput({
  value,
  onChange,
  min,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: TimeInputProps) {
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
        type="time"
        id={id}
        className={formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
