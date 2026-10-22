import { cn } from '@properfy/frontend-standards';

interface AvailabilityCellProps {
  active: boolean;
  override: boolean;
  label: string;
  onToggle?: () => void;
}

const STATE_CLASSES: Record<string, string> = {
  'on-override': 'bg-primary/20 text-primary border border-primary/40',
  'on': 'bg-primary text-white',
  'off-override': 'bg-warning/10 text-warning border border-warning/30',
  'off': 'bg-muted text-muted-foreground',
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
        // Interactive toggle gets the 44px a11y tap target; the display-only
        // variant below stays compact since it is not a touch affordance.
        className={cn(className, 'min-h-touch')}
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
