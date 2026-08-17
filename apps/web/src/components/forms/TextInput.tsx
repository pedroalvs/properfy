import { forwardRef } from 'react';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  type?: 'text' | 'email' | 'tel' | 'password' | 'url';
  id?: string;
  name?: string;
  autoFocus?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  'aria-label'?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    value,
    onChange,
    placeholder,
    disabled,
    error,
    type = 'text',
    id,
    name,
    autoFocus,
    maxLength,
    onFocus,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <input
        ref={ref}
        type={type}
        id={id}
        name={name}
        className={formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={onFocus}
        aria-label={ariaLabel}
      />
    </div>
  );
});
