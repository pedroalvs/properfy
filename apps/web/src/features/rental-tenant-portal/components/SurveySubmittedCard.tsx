import { formatInstantDateTime } from '@/lib/format-date';
import { StarRating } from '@/components/ui/StarRating';

interface SurveySubmittedCardProps {
  rating: number;
  comment?: string | null;
  submittedAt: string;
}

/**
 * Read-only receipt shown after a rating is given, and on every later visit to
 * the same link.
 *
 * Deliberately offers no edit affordance: one response per inspection, immutable
 * once given. It must be fully self-sufficient — it renders from the refetched
 * payload, not from whatever the form held in memory.
 */
export function SurveySubmittedCard({ rating, comment, submittedAt }: SurveySubmittedCardProps) {
  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-real-estate)_45%,white)] bg-[color-mix(in_srgb,var(--color-real-estate)_12%,white)] px-4 py-5 text-center">
      <i className="mdi mdi-check-circle text-3xl text-success" aria-hidden="true" />
      <h2 className="mt-1 text-base font-extrabold text-secondary">Thanks for your feedback</h2>

      <div className="mt-3 flex justify-center">
        <StarRating value={rating} size="md" showValue />
      </div>

      {comment && (
        <blockquote className="mt-3 text-sm italic text-text-secondary">“{comment}”</blockquote>
      )}

      <p className="mt-3 text-xs text-text-muted">
        Submitted {formatInstantDateTime(submittedAt)}
      </p>
    </div>
  );
}
