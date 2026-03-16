interface FilterBooleanProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function FilterBoolean({ label, value, onChange }: FilterBooleanProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded bg-card-bg px-3 py-2 shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.25)]">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary accent-primary"
        aria-label={label}
      />
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  );
}
