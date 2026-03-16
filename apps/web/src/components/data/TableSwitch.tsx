interface TableSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}

export function TableSwitch({ enabled, onChange, label }: TableSwitchProps) {
  const id = `table-switch-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex items-center gap-2 rounded bg-[#F5F5F5] px-3 py-1.5">
      <label htmlFor={id} className="text-sm text-text-secondary cursor-pointer select-none">
        {label}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-primary' : 'bg-[#BDBDBD]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );
}
