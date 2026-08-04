/**
 * Satisfaction rating scale, shared by the tenant portal (which collects it),
 * the admin web app and the inspector PWA (which display it).
 *
 * `apps/web` and `apps/pwa` share no component library, so each renders its own
 * `StarRating`. Keeping the scale, the labels and the number formatting here is
 * what stops the two copies from drifting on the display contract.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Maximum length of the optional free-text comment on a satisfaction survey. */
export const RATING_COMMENT_MAX_LENGTH = 500;

export type RatingValue = 1 | 2 | 3 | 4 | 5;

/**
 * Human labels for each point on the scale. Used as the accessible name of each
 * star in the portal's rating input — a star count alone tells a screen-reader
 * user the position but not the meaning.
 */
export const RATING_LABELS: Record<RatingValue, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

/**
 * Formats an average rating for display, or returns `null` when there is no
 * average to show.
 *
 * Only `null`/`undefined` mean "no responses yet"; callers must render their own
 * empty state for that case rather than printing `0.00`, which would read as a
 * terrible score instead of an absent one.
 */
export function formatRatingAverage(average: number | null | undefined): string | null {
  if (average === null || average === undefined) return null;
  return average.toFixed(2);
}
