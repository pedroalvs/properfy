interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ checked, onChange, label, disabled, id }: CheckboxProps) {
  const iconName = checked ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline';
  const colorClass = disabled
    ? 'text-text-disabled'
    : checked
      ? 'text-primary'
      : 'text-text-muted';

  return (
    <label
      className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        id={id}
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <i className={`mdi ${iconName} text-xl ${colorClass}`} aria-hidden="true" />
      <span
        className={`text-sm ${disabled ? 'text-text-disabled' : 'text-text-primary'}`}
      >
        {label}
      </span>
    </label>
  );
}
