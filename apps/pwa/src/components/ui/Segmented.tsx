import { cn } from '@properfy/frontend-standards';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Segmented control (the `pf-seg` pattern from the validated design): a pill
 * group of mutually exclusive tabs. The active tab lifts onto the card surface;
 * the rest stay muted. Generic over the option id so each caller keeps its own
 * literal union (e.g. 'list' | 'map', 'upcoming' | 'history').
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className={cn('flex rounded-[12px] bg-muted p-1', className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex h-10 flex-1 items-center justify-center rounded-[9px] text-sm font-bold transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
