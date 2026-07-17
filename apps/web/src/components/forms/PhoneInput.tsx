import { useCallback, useEffect, useState } from 'react';
import { applyPhoneMask, stripNonDigits, maxPhoneDigits, toE164Au } from '@/lib/phone-mask';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = '0412 345 678',
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: PhoneInputProps) {
  const [localError, setLocalError] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const stripped = stripNonDigits(raw);
      const max = maxPhoneDigits(stripped);
      const digits = stripped.startsWith('+')
        ? `+${stripped.slice(1).slice(0, max)}`
        : stripped.slice(0, max);
      onChange(applyPhoneMask(digits));
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    setLocalError(value.trim() !== '' && toE164Au(value) === null);
  }, [value]);

  // Local validation applies only to the value it was computed for — clear it
  // on any controlled-value replacement (typing, form reset, external update).
  useEffect(() => {
    setLocalError(false);
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
          type="tel"
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
        <p className="mt-1 text-xs text-error">Enter a valid Australian phone number</p>
      )}
    </div>
  );
}
