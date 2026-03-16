import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  'aria-label'?: string;
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  const handleChange = (raw: string) => {
    // Allow empty, digits, single decimal point, and leading minus
    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  };

  return (
    <div className={containerClass}>
      <input
        type="text"
        inputMode="decimal"
        id={id}
        className={formInput}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
