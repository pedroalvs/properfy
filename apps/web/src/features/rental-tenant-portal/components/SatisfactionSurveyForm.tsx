import { useId, useState } from 'react';
import { RATING_COMMENT_MAX_LENGTH, type RatingValue } from '@properfy/shared';
import { StarRatingInput } from '@/components/ui/StarRatingInput';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { useIsOnline } from '@/hooks/useIsOnline';

export interface SatisfactionSurveySubmission {
  rating: RatingValue;
  comment?: string;
}

interface SatisfactionSurveyFormProps {
  onSubmit: (input: SatisfactionSurveySubmission) => Promise<void>;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  inspectorName?: string | null;
  /** Pre-selected rating; used by tests and by a restored draft. */
  value?: RatingValue | null;
}

export function SatisfactionSurveyForm({
  onSubmit,
  isSubmitting = false,
  errorMessage,
  inspectorName,
  value = null,
}: SatisfactionSurveyFormProps) {
  const [rating, setRating] = useState<RatingValue | null>(value);
  const [comment, setComment] = useState('');
  const commentId = useId();
  const isOnline = useIsOnline();

  const canSubmit = rating !== null && !isSubmitting && isOnline;

  async function handleSubmit() {
    if (rating === null || !canSubmit) return;
    const trimmed = comment.trim();
    try {
      // An empty comment is omitted, not sent as '': absent means "no comment"
      // to the API, and '' would persist a meaningless empty response.
      await onSubmit(trimmed ? { rating, comment: trimmed } : { rating });
    } catch {
      // The parent owns the error banner and the refetch; never flip to a local
      // success state on a rejected mutation.
    }
  }

  return (
    <section className="space-y-5" aria-label="Satisfaction survey">
      {inspectorName && (
        <p className="text-center text-sm text-text-secondary">
          Your inspection was completed by <span className="font-bold">{inspectorName}</span>.
        </p>
      )}

      <StarRatingInput
        label="How satisfied were you with this inspection?"
        value={rating}
        onChange={setRating}
        disabled={isSubmitting}
      />

      <div>
        <label htmlFor={commentId} className="mb-1 block text-sm font-semibold text-text-primary">
          Comment (optional)
        </label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          maxLength={RATING_COMMENT_MAX_LENGTH}
          placeholder="Anything you'd like us to know?"
          className="w-full rounded border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-real-estate/40 disabled:opacity-50"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-xs text-text-muted">
            Your inspector only sees the rating — never your name or comment.
          </p>
          <span
            aria-live="polite"
            className={`shrink-0 text-xs ${
              comment.length >= RATING_COMMENT_MAX_LENGTH * 0.9 ? 'text-warning' : 'text-text-muted'
            }`}
          >
            {comment.length}/{RATING_COMMENT_MAX_LENGTH}
          </span>
        </div>
      </div>

      {!isOnline && <OfflineBanner />}

      {errorMessage && (
        <div
          role="alert"
          className="rounded border border-[color-mix(in_srgb,var(--color-error)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_10%,white)] px-4 py-3 text-sm text-error"
        >
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className={[
          'w-full rounded-full py-3 text-sm font-extrabold transition-colors',
          canSubmit
            ? 'bg-real-estate text-white shadow-[0_8px_18px_-8px_color-mix(in_srgb,var(--color-real-estate)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-real-estate)_85%,black)]'
            : 'cursor-not-allowed bg-gray-100 text-text-muted',
        ].join(' ')}
      >
        {isSubmitting ? 'Submitting…' : 'Submit rating'}
      </button>

      {rating === null && (
        <p className="text-center text-xs text-text-muted">Select a rating to continue</p>
      )}
    </section>
  );
}
