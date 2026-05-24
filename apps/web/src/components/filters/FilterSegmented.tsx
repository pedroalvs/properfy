interface FilterSegmentedProps {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

/** Pill-style segmented control for filter panels (replaces FilterSelect for mode switching). */
export function FilterSegmented({ label, value, options, onChange }: FilterSegmentedProps) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex gap-1" role="tablist" aria-label={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
