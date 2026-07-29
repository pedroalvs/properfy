import { useId, useRef } from 'react';
import {
  DATE_PLACEHOLDER,
  backspaceDateText,
  coerceIsoDate,
  isoDateToMasked,
  maskDateText,
  maskedToIsoDate,
} from '@properfy/shared';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';
import { useMaskedField } from './useMaskedField';

interface DateInputProps {
  /** Canonical `YYYY-MM-DD`, or `''`. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  /** Drops the container chrome so the field can sit inside a filter shell. */
  variant?: 'form' | 'bare';
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * A `dd/mm/yyyy` date field that renders identically on every machine.
 *
 * Replaces `<input type="date">`, which renders in the browser's locale — a
 * US-configured browser shows `mm/dd/yyyy` and nothing in the page can change
 * that. The wire value is unchanged (`YYYY-MM-DD`), so consumers need no edits.
 *
 * `min`/`max` mark the field invalid rather than clamping or blocking keystrokes:
 * clamping silently rewrites what the user meant, and blocking makes it
 * impossible to type an in-range date whose prefix is out of range. The value is
 * still emitted so consumers can render their own message — several already do.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  error,
  id,
  variant = 'form',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const field = useMaskedField({
    value,
    onChange,
    toDisplay: isoDateToMasked,
    toCanonical: (text) => maskedToIsoDate(text, new Date().getFullYear()),
  });

  const outOfRange =
    value !== '' && ((min != null && value < min) || (max != null && value > max));
  const invalid = field.incomplete || outOfRange;

  const handleChange = (next: string) => {
    // Playwright fill(), autofill and paste replace the whole value at once; the
    // mask can never produce this shape, so it cannot fire mid-typing.
    const wholesale = coerceIsoDate(next);
    field.setText(wholesale ? isoDateToMasked(wholesale) : maskDateText(next));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') return;
    const input = event.currentTarget;
    // Only intercept a plain caret-at-end delete; a selection or mid-string edit
    // falls through to the browser and is re-masked by handleChange.
    if (input.selectionStart !== input.value.length || input.selectionStart !== input.selectionEnd) {
      return;
    }
    event.preventDefault();
    field.setText(backspaceDateText(field.text));
  };

  const containerClass = disabled
    ? formInputContainerDisabled
    : error || invalid
      ? formInputContainerError
      : formInputContainer;

  const input = (
    <>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        className={formInput}
        placeholder={DATE_PLACEHOLDER}
        value={field.text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(' ') || undefined}
        aria-invalid={invalid || undefined}
        data-min={min}
        data-max={max}
      />
      <span id={hintId} className="sr-only">
        Date format day slash month slash year, for example 25/12/2026
      </span>
    </>
  );

  if (variant === 'bare') return input;

  return <div className={containerClass}>{input}</div>;
}
