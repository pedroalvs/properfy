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
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <input
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
