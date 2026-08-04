import { useId, useState, type KeyboardEvent } from 'react';
import { RATING_LABELS, RATING_MAX, RATING_MIN, type RatingValue } from '@properfy/shared';

export interface StarRatingInputProps {
  value: number | null;
  onChange: (value: RatingValue) => void;
  disabled?: boolean;
  /** Visible label; also names the radiogroup. */
  label: string;
  error?: string;
  className?: string;
}

const VALUES: RatingValue[] = [1, 2, 3, 4, 5];

/**
 * Interactive 1–5 rating input implementing the ARIA radiogroup pattern.
 *
 * Real `<button role="radio">` children rather than a hidden `<input>` stack, so
 * the keyboard behaviour the role promises is actually implemented (see
 * `apps/web/CLAUDE.md` §10.7): roving tabindex, arrows that move *and* select,
 * wrapping at both ends, Home/End. Wrapping is what distinguishes a radiogroup
 * from a listbox — the latter stops at the ends.
 */
export function StarRatingInput({
  value,
  onChange,
  disabled = false,
  label,
  error,
  className = '',
}: StarRatingInputProps) {
  const labelId = useId();
  const errorId = useId();
  const [hovered, setHovered] = useState<RatingValue | null>(null);

  // Nothing picked yet: the first star carries the tab stop so the control is
  // reachable, without claiming to be selected.
  const focusedValue = (value ?? RATING_MIN) as RatingValue;

  function move(next: RatingValue) {
    if (disabled) return;
    onChange(next);
    // Focus follows selection, as the pattern requires.
    document.getElementById(`${labelId}-star-${next}`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const current = value ?? RATING_MIN;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move((current === RATING_MAX ? RATING_MIN : current + 1) as RatingValue);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move((current === RATING_MIN ? RATING_MAX : current - 1) as RatingValue);
        break;
      case 'Home':
        event.preventDefault();
        move(RATING_MIN as RatingValue);
        break;
      case 'End':
        event.preventDefault();
        move(RATING_MAX as RatingValue);
        break;
      default:
        break;
    }
  }

  // Hover preview is mouse-only — a touch device would otherwise leave a star
  // looking selected after a tap that selected something else.
  const previewed = hovered ?? value ?? 0;

  return (
    <div className={className}>
      <p id={labelId} className="mb-2 text-center text-sm font-semibold text-text-primary">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHovered(null)}
        className="flex items-center justify-center gap-1"
      >
        {VALUES.map((star) => {
          const filled = star <= previewed;
          const checked = value === star;
          return (
            <button
              key={star}
              id={`${labelId}-star-${star}`}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'} — ${RATING_LABELS[star]}`}
              tabIndex={star === focusedValue ? 0 : -1}
              disabled={disabled}
              onClick={() => !disabled && onChange(star)}
              onMouseEnter={() => !disabled && setHovered(star)}
              className={[
                'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-real-estate/40',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                filled ? 'text-real-estate' : 'text-gray-300',
              ].join(' ')}
            >
              <i className={`mdi ${filled ? 'mdi-star' : 'mdi-star-outline'} text-[32px]`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Confirms the choice in words, so meaning never rests on colour alone. */}
      <p aria-live="polite" className="mt-1 h-5 text-center text-sm text-text-secondary">
        {value ? RATING_LABELS[value as RatingValue] : ''}
      </p>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-center text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
