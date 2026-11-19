import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';

export type ProfileTileTone = 'default' | 'good' | 'warning' | 'danger';

const DOT_CLASS: Record<Exclude<ProfileTileTone, 'default'>, string> = {
  good: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

const VALUE_CLASS: Record<ProfileTileTone, string> = {
  default: 'text-muted-foreground',
  good: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

interface ProfileTileProps {
  icon: ReactNode;
  label: string;
  to: string;
  /** Short status/summary line under the label. */
  value?: string;
  /** Drives the corner status dot and the value colour. */
  tone?: ProfileTileTone;
  /** Extra classes on the tile (e.g. `col-span-2` for a full-width tile). */
  className?: string;
  'data-testid'?: string;
}

/**
 * A large, glanceable navigation tile for the Profile grid — built for a field
 * inspector: a big touch target, an icon, a bold label and an optional status
 * line. A coloured corner dot flags anything that needs attention (e.g. an
 * expiring document) so it reads before the words do.
 */
export function ProfileTile({
  icon,
  label,
  to,
  value,
  tone = 'default',
  className,
  'data-testid': testId,
}: ProfileTileProps) {
  return (
    <Link
      to={to}
      // Fold the status line into the accessible name so a screen reader announces
      // e.g. "Documents, 1 expiring" — the dot is decorative (aria-hidden).
      aria-label={value ? `${label}, ${value}` : label}
      data-testid={testId}
      className={cn(
        'relative flex min-h-[112px] touch-manipulation flex-col justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-sm',
        'transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
    >
      {tone !== 'default' && (
        <span
          data-testid={testId ? `${testId}-dot` : undefined}
          className={cn('absolute right-3 top-3 h-2.5 w-2.5 rounded-full', DOT_CLASS[tone])}
          aria-hidden="true"
        />
      )}
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold text-foreground">{label}</span>
        {value && <span className={cn('truncate text-xs font-semibold', VALUE_CLASS[tone])}>{value}</span>}
      </span>
    </Link>
  );
}
