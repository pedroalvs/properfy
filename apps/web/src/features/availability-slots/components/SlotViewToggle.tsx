export type SlotView = 'table' | 'calendar';

interface SlotViewToggleProps {
  view: SlotView;
  onChange: (view: SlotView) => void;
}

export function SlotViewToggle({ view, onChange }: SlotViewToggleProps) {
  const baseClass = 'inline-flex h-9 items-center gap-1.5 rounded px-3 text-sm font-semibold transition-colors duration-150';
  const activeClass = 'bg-primary text-white';
  const inactiveClass = 'border border-primary text-primary bg-transparent hover:bg-primary/5';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`${baseClass} ${view === 'table' ? activeClass : inactiveClass}`}
        onClick={() => onChange('table')}
        aria-label="Table view"
        aria-pressed={view === 'table'}
      >
        <i className="mdi mdi-table text-base" aria-hidden="true" />
        Table
      </button>
      <button
        type="button"
        className={`${baseClass} ${view === 'calendar' ? activeClass : inactiveClass}`}
        onClick={() => onChange('calendar')}
        aria-label="Calendar view"
        aria-pressed={view === 'calendar'}
      >
        <i className="mdi mdi-calendar text-base" aria-hidden="true" />
        Calendar
      </button>
    </div>
  );
}
