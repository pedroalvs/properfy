import {
  formTextarea,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';

interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  rows?: number;
  maxLength?: number;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
  error,
  rows = 3,
  maxLength,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: TextareaProps) {
  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div className={containerClass}>
      <textarea
        id={id}
        name={name}
        className={formTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
      />
    </div>
  );
}
