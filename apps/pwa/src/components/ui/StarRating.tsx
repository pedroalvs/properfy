import { Star } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { formatRatingAverage, RATING_MAX } from '@properfy/shared';

export interface StarRatingProps {
  /** Average rating, or `null` when there are no responses. Never pass 0 for "unrated". */
  value: number | null | undefined;
  /** Number of responses behind the average. Omit where it would be noise. */
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Renders the numeric average next to the star. */
  showValue?: boolean;
  /** Shown instead of a score when there are no responses. */
  emptyLabel?: string;
  className?: string;
}

const sizeClasses = {
  sm: { text: 'text-sm', star: 'h-4 w-4' },
  md: { text: 'text-base', star: 'h-[18px] w-[18px]' },
  lg: { text: 'text-2xl font-bold', star: 'h-6 w-6' },
} as const;

/**
 * Mirror of apps/web/src/components/ui/StarRating.tsx. apps/web and apps/pwa
 * share no component library by design; the display contract they must not drift
 * on lives in @properfy/shared (formatRatingAverage, RATING_MAX).
 *
 * Read-only rating display: one filled star plus the numeric average, rather
 * than five glyphs. At table-cell size a five-star strip is unreadable and
 * doubles the column width for no extra information.
 *
 * The whole control is a single `role="img"` with a worded label — otherwise a
 * screen reader announces "star ( 12 )", which is noise.
 */
export function StarRating({
  value,
  count,
  size = 'md',
  showValue = false,
  emptyLabel = '—',
  className = '',
}: StarRatingProps) {
  const formatted = formatRatingAverage(value);
  const classes = sizeClasses[size];

  if (formatted === null) {
    return (
      <span
        role="img"
        aria-label="No ratings yet"
        className={cn('text-muted-foreground', classes.text, className)}
      >
        {emptyLabel}
      </span>
    );
  }

  const label =
    count === undefined
      ? `Rated ${value} out of ${RATING_MAX}`
      : `Rated ${value} out of ${RATING_MAX} from ${count} ${count === 1 ? 'response' : 'responses'}`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-1', classes.text, className)}
    >
      {showValue && <span className="text-foreground">{formatted}</span>}
      <Star className={cn('fill-current text-primary', classes.star)} aria-hidden="true" />
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}
