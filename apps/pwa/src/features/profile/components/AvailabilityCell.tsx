interface AvailabilityCellProps {
  active: boolean;
  override: boolean;
  label: string;
  onToggle?: () => void;
}

const STATE_CLASSES: Record<string, string> = {
  'on-override': 'bg-primary/20 text-primary border border-primary/40',
  'on': 'bg-primary text-white',
  'off-override': 'bg-amber-100 text-amber-700 border border-amber-300',
  'off': 'bg-gray-100 text-gray-400',
};

export function AvailabilityCell({ active, override, label, onToggle }: AvailabilityCellProps) {
  const state = active
    ? override ? 'on-override' : 'on'
    : override ? 'off-override' : 'off';

  const className = `flex items-center justify-center rounded text-xs font-medium py-1 ${STATE_CLASSES[state]}`;

  if (onToggle) {
    return (
      <button
        type="button"
        role="button"
        data-testid="availability-cell"
        data-state={state}
        aria-pressed={active}
        onClick={onToggle}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      data-testid="availability-cell"
      data-state={state}
      className={className}
    >
      {label}
    </div>
  );
}
