import type { ReactNode } from 'react';

interface TableSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  children?: ReactNode;
}

export function TableSwitch({ enabled, onChange, label, children }: TableSwitchProps) {
  const id = `table-switch-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="mb-3 flex items-center rounded-lg bg-[#EEEEEE] px-5 py-4">
      <div className="flex items-center gap-3">
        <button
          id={id}
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
            enabled ? 'bg-primary' : 'bg-[#939393]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
              enabled ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
        <label htmlFor={id} className="cursor-pointer select-none text-sm text-text-primary">
          {label}
        </label>
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
