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
/** Height used only when the panel has no laid-out height yet (offsetHeight 0). */
const PANEL_HEIGHT_ESTIMATE = 340;
/** Breathing room between the field and the popup, and from the viewport edges. */
const GUTTER = 4;
const VIEWPORT_MARGIN = 8;
/** Above the modal layer (`Dialog`/`DrawerPanel` use `z-50`) so it always wins. */
const POPUP_Z_INDEX = 60;

/**
 * Fixed-position coordinates for the portaled popup. The panel is anchored to
 * the field's near edge — `top` when it opens below, `bottom` when it opens
 * above — so it always grows away from the field and can never cover it.
 * `maxHeight` caps it to the room on that side so a tall month scrolls inside the
 * panel instead of running off the viewport.
 */
type PopupCoords = { left: number; maxHeight: number; top?: number; bottom?: number };

function sameCoords(a: PopupCoords | null, b: PopupCoords | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.bottom === b.bottom && a.maxHeight === b.maxHeight
  );
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
  const [coords, setCoords] = useState<PopupCoords | null>(null);

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
   * it, so placement (below vs above) is decided against the viewport using the
   * panel's real height, and the panel is anchored to the field's near edge.
   */
  const computeCoords = useCallback((): PopupCoords | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    // Hide (rather than float detached) when the field has scrolled out of the
    // viewport inside a scrolling modal body; it reappears, re-anchored, on scroll back.
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
    // Real size once mounted; the estimates only apply while the panel has no
    // laid-out box yet (jsdom, or before first paint).
    const panelHeight = panelRef.current?.offsetHeight || PANEL_HEIGHT_ESTIMATE;
    const panelWidth = panelRef.current?.offsetWidth || PANEL_WIDTH;
    const spaceBelow = window.innerHeight - rect.bottom - GUTTER;
    const spaceAbove = rect.top - GUTTER;

    let left = rect.left;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - panelWidth;
    if (left > maxLeft) left = maxLeft;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    // Prefer below (native feel). Flip above only when the panel genuinely does
    // not fit below but there is more room above — decided against the *real*
    // panel height, not a fixed threshold. `maxHeight` caps the panel to the room
    // on the chosen side so a month taller than that scrolls internally rather
    // than off the viewport edge.
    const placeBelow = panelHeight <= spaceBelow || spaceBelow >= spaceAbove;
    if (placeBelow) {
      // Anchored to the field's bottom edge; the panel grows downward, so a
      // taller month never overlaps the field.
      return { top: rect.bottom + GUTTER, left, maxHeight: Math.max(0, spaceBelow - VIEWPORT_MARGIN) };
    }
    // Anchored to the field's top edge via the viewport's bottom coordinate; the
    // panel grows *upward* as the month grid changes height, so it likewise never
    // covers the field and needs no re-measure when its own height changes.
    return {
      bottom: window.innerHeight - rect.top + GUTTER,
      left,
      maxHeight: Math.max(0, spaceAbove - VIEWPORT_MARGIN),
    };
  }, []);

  const applyCoords = useCallback(() => {
    setCoords((prev) => {
      const next = computeCoords();
      // Skip the re-render (and the CalendarPanel re-mount) when nothing moved —
      // a scroll where the field stays put relative to the viewport is common.
      return sameCoords(prev, next) ? prev : next;
    });
  }, [computeCoords]);

  const openCalendar = () => setOpen(true);

  // Measure and place the popup once it is mounted (so `panelRef` size is real).
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    applyCoords();
  }, [open, applyCoords]);

  // Keep the popup anchored to the field if the host scrolls or the window
  // resizes. Coalesce bursts into one measurement per frame so a fast scroll
  // (capture phase catches nested scroll containers too) doesn't thrash layout.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const reposition = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyCoords();
      });
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, applyCoords]);

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

  // Escape closes only the calendar, never the host modal. A document
  // capture-phase listener runs before the Dialog/DrawerPanel's bubble-phase
  // document listener, so stopping propagation here is reliable even when focus
  // sits inside the panel — which is portaled to document.body and therefore does
  // not bubble through the field's own DOM subtree.
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const active = document.activeElement;
      const focusInside =
        (containerRef.current?.contains(active) ?? false) ||
        (panelRef.current?.contains(active) ?? false);
      // Only own the Escape while focus is in the field/panel: then close only the
      // calendar and shield the host modal from it. If focus has since moved
      // elsewhere, still close the stale calendar but let the key reach its target.
      if (focusInside) {
        event.stopPropagation();
        inputRef.current?.focus();
      }
      setOpen(false);
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [open]);

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
    <div ref={containerRef} className={containerClass}>
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
            className="w-[19rem] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded border border-black/10 bg-card-bg shadow-lg"
            style={{
              position: 'fixed',
              top: coords?.top,
              bottom: coords?.bottom,
              left: coords?.left ?? 0,
              maxHeight: coords?.maxHeight,
              zIndex: POPUP_Z_INDEX,
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
