import { cn } from '@properfy/frontend-standards';
import type { LiveDayInspectorState } from '@properfy/shared';
import { STATE_VISUALS } from '../lib/stateVisuals';

interface LiveDayStateBadgeProps {
  state: LiveDayInspectorState;
  className?: string;
}

/**
 * The inspector's derived state as an icon + text (never colour alone, WCAG
 * 1.4.1). Labels come from the shared contract so they match the pins and the
 * summary counters.
 */
export function LiveDayStateBadge({ state, className }: LiveDayStateBadgeProps) {
  const visual = STATE_VISUALS[state];
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', visual.textClass, className)}>
      <i className={cn('mdi', visual.icon, 'text-base leading-none')} aria-hidden="true" />
      {visual.label}
    </span>
  );
}
