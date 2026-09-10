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
/** Height used only when the panel has no laid-out height yet (scrollHeight 0). */
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

/** Enabled, focusable controls inside the calendar panel, in DOM order. */
function panelFocusables(panel: HTMLElement | null): HTMLButtonElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
}

/** Where keyboard focus should land when the calendar opens: the selected day
 *  (marked `aria-pressed`), else the first control. */
function panelInitialFocus(panel: HTMLElement | null): HTMLButtonElement | null {
  const selected = panel?.querySelector<HTMLButtonElement>(
    'button[aria-pressed="true"]:not([disabled])',
  );
  return selected ?? panelFocusables(panel)[0] ?? null;
}

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
  // Set when the calendar is opened by keyboard, so focus is moved into the grid
  // once it mounts (a mouse open leaves focus on the field, keeping it typeable).
  const focusGridOnOpenRef = useRef(false);
  // Placement is decided once per open and kept for its lifetime, so scrolling the
  // field toward a viewport edge repositions the panel without flipping sides.
  const placementRef = useRef<'below' | 'above' | null>(null);
  const hintId = useId();
  const panelId = useId();
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

  // While the calendar is open, Tab (and ArrowDown, the combobox affordance) steps
  // into the grid — the panel is portaled to the end of the document, so without
  // this a keyboard user could never reach it from either trigger (field or icon).
  const stepIntoCalendar = (event: React.KeyboardEvent): boolean => {
    if (!open || event.shiftKey || (event.key !== 'Tab' && event.key !== 'ArrowDown')) {
      return false;
    }
    const target = panelInitialFocus(panelRef.current);
    if (!target) return false;
    event.preventDefault();
    target.focus();
    return true;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // ArrowDown is the standard combobox gesture to open the popup the field
    // advertises (aria-haspopup="dialog"); once open it steps into the grid.
    if (!open && variant === 'form' && !disabled && !event.shiftKey && event.key === 'ArrowDown') {
      event.preventDefault();
      focusGridOnOpenRef.current = true;
      openCalendar();
      return;
    }
    if (stepIntoCalendar(event)) return; // typing is untouched; only Tab/ArrowDown route in
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
    // The panel is edge-anchored to the field, so if the field scrolls out of the
    // viewport the panel simply travels off-screen with it — no detached float, and
    // (unlike visibility:hidden) keyboard focus is never dropped out of the panel.
    // Real size once mounted; the estimates only apply while the panel has no
    // laid-out box yet (jsdom, or before first paint). Use scrollHeight — the
    // natural content height — for the flip decision, so a panel already capped by
    // maxHeight can still flip to a side with room for its full height.
    const panelHeight = panelRef.current?.scrollHeight || PANEL_HEIGHT_ESTIMATE;
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
    // than off the viewport edge. The side is decided once per open (placementRef)
    // and reused, so scrolling repositions without flipping mid-scroll.
    const placeBelow =
      placementRef.current != null
        ? placementRef.current === 'below'
        : panelHeight <= spaceBelow || spaceBelow >= spaceAbove;
    placementRef.current = placeBelow ? 'below' : 'above';
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
      placementRef.current = null;
      return;
    }
    applyCoords();
  }, [open, applyCoords]);

  // Move focus into the grid on a keyboard open — but only once coords are applied
  // and the panel is actually visible. Focusing a still-`visibility:hidden` subtree
  // is a no-op in real browsers, so this must wait for the visible paint.
  useLayoutEffect(() => {
    if (open && coords && focusGridOnOpenRef.current) {
      focusGridOnOpenRef.current = false;
      panelInitialFocus(panelRef.current)?.focus();
    }
  }, [open, coords]);

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
      // Only own the Escape when focus is actually inside the widget (it always is
      // while open — a focus-leave closes the calendar). This shields the host
      // modal from the keypress without swallowing an Escape meant for some other
      // page-level handler should focus ever be elsewhere.
      const active = document.activeElement;
      const focusInside =
        (containerRef.current?.contains(active) ?? false) ||
        (panelRef.current?.contains(active) ?? false);
      if (!focusInside) return;
      event.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [open]);

  // Close when focus genuinely leaves the widget — e.g. Shift+Tab off the field,
  // or Tab past the panel. Tab *into* the panel is routed by stepIntoCalendar and
  // stays inside, so this only fires on a real exit and never strands an open,
  // unfocused dialog.
  useEffect(() => {
    if (!open) return;
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideContainer && !insidePanel) setOpen(false);
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [open]);

  // Tabbing off either end of the panel closes the calendar and returns focus to
  // the field, from which normal tabbing resumes. The panel is portaled to the end
  // of the document, so letting Tab fall through would strand focus at the end of
  // the page; returning to the in-flow field gives a predictable, non-trapping
  // exit in both directions (WCAG 2.1.2). Tab between controls inside the panel is
  // left to the browser.
  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const focusables = panelFocusables(panelRef.current);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const leavingBackwards = event.shiftKey && active === first;
    const leavingForwards = !event.shiftKey && active === last;
    if (leavingBackwards || leavingForwards) {
      event.preventDefault();
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
        // Advertise the calendar popup to assistive tech. Focus stays on the field
        // (so it stays typeable); AT learns it is expandable and when it is open.
        aria-haspopup={variant === 'form' && !disabled ? 'dialog' : undefined}
        aria-expanded={variant === 'form' && !disabled ? open : undefined}
        aria-controls={open && variant === 'form' ? panelId : undefined}
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
            onKeyDown={stepIntoCalendar}
            aria-label="Open calendar"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
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
            id={panelId}
            role="dialog"
            aria-label="Choose date"
            onKeyDown={handlePanelKeyDown}
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
