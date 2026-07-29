import { useId, useRef } from 'react';
import {
  TIME_PLACEHOLDER,
  applyMeridiem,
  backspaceTimeText,
  coerceWallTime,
  maskTimeText,
  maskedToWallTime,
  parseTimeParts,
  wallTimeToMasked,
  type Meridiem,
} from '@properfy/shared';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';
import { useMaskedField } from './useMaskedField';

interface TimeInputProps {
  /** Canonical 24-hour `HH:mm`, or `''`. */
  value: string;
  onChange: (value: string) => void;
  /** `HH:mm` lower bound — marks the field invalid, does not block input. */
  min?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  /** Drops the container chrome so the field can sit inside a filter shell. */
  variant?: 'form' | 'bare';
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * An `h:mm am` time field that renders identically on every machine.
 *
 * Replaces `<input type="time">`, which renders in the browser's locale — a
 * US-configured browser shows a 24-hour clock and nothing in the page can change
 * that. The wire value is unchanged (24-hour `HH:mm`), so consumers need no edits.
 *
 * ## The meridiem is never inferred
 *
 * Typing `930` leaves the field incomplete and invalid until the user states am
 * or pm, either by typing `a`/`p` or by pressing the toggle. Guessing would be
 * one keystroke cheaper, but a guess the user does not notice books an
 * inspection twelve hours from where they meant.
 */
export function TimeInput({
  value,
  onChange,
  min,
  disabled,
  error,
  id,
  variant = 'form',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: TimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const field = useMaskedField({
    value,
    onChange,
    toDisplay: wallTimeToMasked,
    toCanonical: maskedToWallTime,
  });

  const beforeMin = value !== '' && min != null && value < min;
  const invalid = field.incomplete || beforeMin;
  const { meridiem } = parseTimeParts(field.text);
  const hasDigits = field.text !== '';

  const handleChange = (next: string) => {
    // @see DateInput — same wholesale-replacement rationale.
    const wholesale = coerceWallTime(next);
    field.setText(wholesale ? wallTimeToMasked(wholesale) : maskTimeText(next));
  };

  const setMeridiem = (next: Meridiem) => {
    field.setText(applyMeridiem(field.text, next));
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key.toLowerCase();
    // `event.key` is 'a' for Ctrl/Cmd+A too, so without this guard select-all is
    // swallowed and silently flips the meridiem instead — removing the standard
    // way to replace the field, which the mid-string edit path relies on.
    // Ctrl+P (print) has the same problem.
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

    // a/p set the meridiem from anywhere in the field, so the user never has to
    // position the caret to finish the value.
    if (!hasModifier && (key === 'a' || key === 'p')) {
      event.preventDefault();
      field.setText(applyMeridiem(field.text, key === 'p' ? 'pm' : 'am'));
      return;
    }

    if (event.key !== 'Backspace') return;
    const input = event.currentTarget;
    if (input.selectionStart !== input.value.length || input.selectionStart !== input.selectionEnd) {
      return;
    }
    event.preventDefault();
    field.setText(backspaceTimeText(field.text));
  };

  const containerClass = disabled
    ? formInputContainerDisabled
    : error || invalid
      ? formInputContainerError
      : formInputContainer;

  const body = (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        className={formInput}
        placeholder={TIME_PLACEHOLDER}
        value={field.text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(' ') || undefined}
        aria-invalid={invalid || undefined}
        data-min={min}
      />

      {/* Always reachable, so the meridiem never depends on typing a letter —
          which matters most on a numeric keypad. */}
      {hasDigits && !disabled && (
        <div className="mr-1 flex shrink-0 gap-0.5" role="group" aria-label="Meridiem">
          {(['am', 'pm'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMeridiem(option)}
              aria-pressed={meridiem === option}
              aria-label={option === 'am' ? 'AM' : 'PM'}
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase transition-colors ${
                meridiem === option
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <span id={hintId} className="sr-only">
        Time format hour colon minutes then a m or p m, for example 9:30 am
      </span>
    </div>
  );

  if (variant === 'bare') return body;

  return <div className={containerClass}>{body}</div>;
}
