import { useCallback } from 'react';
import { applyPhoneMask, stripNonDigits, maxPhoneDigits } from '@/lib/phone-mask';
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

  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <input
        type="tel"
        id={id}
        className={formInput}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
