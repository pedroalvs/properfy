import { useRef, useState } from 'react';

interface MaskedFieldOptions {
  /** Canonical value owned by the parent (`YYYY-MM-DD`, `HH:mm`, or `''`). */
  value: string;
  onChange: (value: string) => void;
  /** Renders the canonical value as masked display text. */
  toDisplay: (value: string) => string;
  /** Parses masked display text back to a canonical value, or null if incomplete. */
  toCanonical: (text: string) => string | null;
}

interface MaskedField {
  /** Masked text currently shown in the input. */
  text: string;
  /** Replaces the text and emits the resulting canonical value (or `''`). */
  setText: (text: string) => void;
  /** True when the field holds text that does not yet parse. */
  incomplete: boolean;
}

/**
 * Keeps masked display text in sync with a canonical value owned by the parent.
 *
 * ## The hazard this exists to avoid
 *
 * The obvious implementation is:
 *
 *     useEffect(() => setText(toDisplay(value)), [value]);   // ✗
 *
 * which breaks three ways in this codebase:
 *
 * 1. **Self-echo.** Every keystroke that completes a value calls `onChange`; the
 *    parent stores it and re-renders with a new `value`; the effect then rewrites
 *    the text from the canonical value. Even when the string is identical React
 *    commits it to the DOM node and the caret jumps to the end — so typing
 *    `15/06/2026` loses the caret mid-sequence. If a parent normalises the value
 *    on the way back, the two ping-pong forever.
 * 2. **Unstable dependencies.** Every consumer passes an inline lambda
 *    (`onChange={(v) => updateField('scheduledDate', v)}`), so anything derived
 *    from `onChange` in a dep array re-runs the effect on every parent render and
 *    resets the draft mid-typing. That is the failure documented at
 *    `ChangeTimeSheet.tsx` and in `apps/web/CLAUDE.md` rule 13.11 (PR #961).
 * 3. **Destroyed drafts.** A partially-typed value emits `''`, which the effect
 *    would immediately turn into empty text, wiping what the user typed.
 *
 * Instead the value is reconciled **during render**, with no effect and no
 * dependency array, and `syncedFrom` is written *before* `onChange` fires so our
 * own echo is a no-op. Only a genuinely external change — a form reset, an
 * entity load, a parent clamping the value — differs from `syncedFrom` and
 * legitimately re-syncs the text.
 */
export function useMaskedField({
  value,
  onChange,
  toDisplay,
  toCanonical,
}: MaskedFieldOptions): MaskedField {
  const [text, setTextState] = useState(() => toDisplay(value));
  const syncedFrom = useRef(value);

  // Render-phase reconciliation. React re-runs this component before committing,
  // so there is no extra paint and nothing can disturb focus or the caret.
  if (value !== syncedFrom.current) {
    syncedFrom.current = value;
    setTextState(toDisplay(value));
  }

  const setText = (next: string) => {
    setTextState(next);

    const canonical = toCanonical(next) ?? '';
    // Written BEFORE the callback: the parent's echo then compares equal above
    // and cannot rewrite the text we are mid-way through editing.
    if (canonical === syncedFrom.current) return;
    syncedFrom.current = canonical;
    onChange(canonical);
  };

  return { text, setText, incomplete: text !== '' && toCanonical(text) === null };
}
