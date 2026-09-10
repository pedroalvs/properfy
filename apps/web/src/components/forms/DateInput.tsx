import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DATE_PLACEHOLDER,
  backspaceDateText,
  coerceIsoDate,
  isoDateToMasked,
  maskDateText,
  maskedToIsoDate,
} from '@properfy/shared';
import { CalendarPanel } from '@/components/ui/CalendarPanel';
import {
  formInput,
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
} from './form-styles';
import { resolveDropdownPlacement } from './dropdown-placement';
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

/** Panel width, in px, matching the `w-[19rem]` class on the popup. */
const PANEL_WIDTH = 304;
/** Fallback panel height for the first paint, before `panelRef` is measured. */
const PANEL_HEIGHT_ESTIMATE = 340;
/** Breathing room between the field and the popup, and from the viewport edges. */
const GUTTER = 4;
const VIEWPORT_MARGIN = 8;

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
 *
 * The calendar popup is rendered into `document.body` via a portal with
 * `position: fixed` coordinates. It must escape the overflow of whatever hosts
 * the field — a `Dialog`/`DrawerPanel` body scrolls (`overflow-y-auto`), and an
 * absolutely-positioned popup would be clipped by it (and add an inner scrollbar)
 * instead of floating over the page.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

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

  /**
   * Fixed, viewport-relative coordinates for the portaled popup. Because it
   * escapes every overflow ancestor, the viewport is the only thing that clips
   * it, so placement is decided against the viewport rather than the nearest
   * scrolling parent. Flip logic is delegated to `resolveDropdownPlacement`.
   */
  const computeCoords = useCallback((): { top: number; left: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight || PANEL_HEIGHT_ESTIMATE;
    const { placement } = resolveDropdownPlacement({
      triggerTop: rect.top,
      triggerBottom: rect.bottom,
      clipTop: 0,
      clipBottom: window.innerHeight,
    });
    const top =
      placement === 'above' ? rect.top - panelHeight - GUTTER : rect.bottom + GUTTER;
    let left = rect.left;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - PANEL_WIDTH;
    if (left > maxLeft) left = maxLeft;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    return { top, left };
  }, []);

  const openCalendar = () => setOpen(true);

  // Measure and place the popup once it is mounted (so `panelRef` height is real).
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    setCoords(computeCoords());
  }, [open, computeCoords]);

  // Keep the popup anchored to the field if the host scrolls or the window resizes.
  useEffect(() => {
    if (!open) return;
    const reposition = () => setCoords(computeCoords());
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, computeCoords]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // The popup lives in document.body (portal), so it is outside the
      // container's DOM subtree — check it explicitly or a click on a day closes
      // the popup before it can register.
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideContainer && !insidePanel) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleContainerKeyDown = (event: React.KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      // Stop the host Dialog from closing along with the popover. React routes
      // synthetic events through the component tree, so keydown from the portaled
      // panel still bubbles here.
      event.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
    }
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
        // Clicking anywhere in the field opens the calendar while keeping the
        // caret for typing. Open-on-click (not focus) avoids re-opening when a day
        // pick programmatically refocuses the input.
        onClick={() => {
          if (!disabled && variant === 'form') openCalendar();
        }}
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

  // The filter shell supplies its own chrome and has no room for a popover.
  if (variant === 'bare') return input;

  return (
    <div ref={containerRef} className={containerClass} onKeyDown={handleContainerKeyDown}>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">{input}</div>
        {!disabled && (
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openCalendar())}
            aria-label="Open calendar"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="mr-1 shrink-0 rounded p-1 text-text-secondary hover:bg-primary/10 hover:text-primary"
          >
            <i className="mdi mdi-calendar text-base" aria-hidden="true" />
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose date"
            className="w-[19rem] overflow-visible rounded border border-black/10 bg-card-bg shadow-lg"
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              zIndex: 50,
              visibility: coords ? 'visible' : 'hidden',
            }}
          >
            <CalendarPanel
              selected={value}
              min={min}
              max={max}
              onSelect={(next) => {
                field.setText(isoDateToMasked(next));
                setOpen(false);
                inputRef.current?.focus();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
