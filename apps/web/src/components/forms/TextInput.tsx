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
  'aria-label'?: string;
}

export function TextInput({
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
  'aria-label': ariaLabel,
}: TextInputProps) {
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <input
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
        aria-label={ariaLabel}
      />
    </div>
  );
}
