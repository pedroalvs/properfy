import { useId, useRef, useState } from 'react';
import {
  DATE_PLACEHOLDER,
  backspaceDateText,
  coerceIsoDate,
  isoDateToMasked,
  maskDateText,
  maskedToIsoDate,
} from '@properfy/shared';

interface DateFieldProps {
  /** Canonical `YYYY-MM-DD`, or `''`. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * A `dd/mm/yyyy` date field for the inspector app.
 *
 * Replaces `<input type="date">`, which renders in the browser's locale. That
 * matters more here than on desktop: an inspector's phone can be configured in
 * any locale, and the native control would then disagree with every date the
 * rest of the app displays.
 *
 * `inputMode="numeric"` keeps entry to eight taps on the numeric keypad, without
 * a keyboard switch.
 *
 * Kept deliberately small — this is a filter field, so it has no calendar
 * popover and no validation chrome; an incomplete value simply reads as empty.
 */
export function DateField({
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: DateFieldProps) {
  const hintId = useId();
  const [text, setText] = useState(() => isoDateToMasked(value));
  const syncedFrom = useRef(value);

  // Render-phase reconciliation rather than an effect: an effect keyed on
  // `value` would rewrite the text on the parent's echo of our own emit and
  // steal the caret mid-typing. See apps/web useMaskedField for the full note.
  if (value !== syncedFrom.current) {
    syncedFrom.current = value;
    setText(isoDateToMasked(value));
  }

  const commit = (nextText: string) => {
    setText(nextText);
    const canonical = maskedToIsoDate(nextText, new Date().getFullYear()) ?? '';
    if (canonical === syncedFrom.current) return;
    syncedFrom.current = canonical;
    onChange(canonical);
  };

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={className}
        placeholder={DATE_PLACEHOLDER}
        value={text}
        onChange={(e) => {
          const wholesale = coerceIsoDate(e.target.value);
          commit(wholesale ? isoDateToMasked(wholesale) : maskDateText(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Backspace') return;
          const input = e.currentTarget;
          if (
            input.selectionStart !== input.value.length ||
            input.selectionStart !== input.selectionEnd
          ) {
            return;
          }
          e.preventDefault();
          commit(backspaceDateText(text));
        }}
        aria-label={ariaLabel}
        aria-describedby={hintId}
      />
      <span id={hintId} className="sr-only">
        Date format day slash month slash year, for example 25/12/2026
      </span>
    </>
  );
}
