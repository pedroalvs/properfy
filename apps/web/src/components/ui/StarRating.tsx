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
  sm: { text: 'text-sm', star: 'text-base' },
  md: { text: 'text-base', star: 'text-lg' },
  lg: { text: 'text-2xl font-bold', star: 'text-2xl' },
} as const;

/**
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
        className={`text-text-muted ${classes.text} ${className}`}
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
      className={`inline-flex items-center gap-1 ${classes.text} ${className}`}
    >
      {showValue && <span className="text-text-primary">{formatted}</span>}
      <i className={`mdi mdi-star text-real-estate ${classes.star}`} aria-hidden="true" />
      {count !== undefined && <span className="text-text-muted">({count})</span>}
    </span>
  );
}
