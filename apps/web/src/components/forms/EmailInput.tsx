import { useState, useCallback } from 'react';
import { isValidEmail } from '@/lib/validation';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function EmailInput({
  value,
  onChange,
  placeholder = 'email@example.com',
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: EmailInputProps) {
  const [localError, setLocalError] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      if (localError) setLocalError(false);
    },
    [onChange, localError],
  );

  const handleBlur = useCallback(() => {
    if (value.trim() && !isValidEmail(value)) {
      setLocalError(true);
    } else {
      setLocalError(false);
    }
  }, [value]);

  const hasError = error || localError;

  const containerClass = disabled
    ? formInputContainerDisabled
    : hasError
      ? formInputContainerError
      : formInputContainer;

  return (
    <div>
      <div className={containerClass}>
        <input
          type="email"
          id={id}
          className={formInput}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      </div>
      {localError && !error && (
        <p className="mt-1 text-xs text-error">Invalid email address</p>
      )}
    </div>
  );
}
