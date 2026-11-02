import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { cn } from '@properfy/frontend-standards';
import { TimePanel } from '@/components/ui/TimePanel';
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

const PANEL_WIDTH = 304;
const PANEL_HEIGHT_ESTIMATE = 240;
const GUTTER = 4;
const VIEWPORT_MARGIN = 8;
const POPUP_Z_INDEX = 60;

type PopupCoords = { left: number; maxHeight: number; top?: number; bottom?: number };

function sameCoords(a: PopupCoords | null, b: PopupCoords | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.bottom === b.bottom && a.maxHeight === b.maxHeight
  );
}

function panelFocusables(panel: HTMLElement | null): HTMLButtonElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
}

/**
 * An `h:mm am` time field that renders identically on every machine.
 *
 * Replaces `<input type="time">`, which renders in the browser's locale — a
 * US-configured browser shows a 24-hour clock and nothing in the page can change
 * that. The wire value is unchanged (24-hour `HH:mm`), so consumers need no edits.
 *
 * Clicking the field or the clock icon opens a portaled popover dialog with
 * TimePanel, in the same design pattern as DateInput / CalendarPanel.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<'below' | 'above' | null>(null);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopupCoords | null>(null);

  const hintId = useId();
  const panelId = useId();

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
    const wholesale = coerceWallTime(next);
    field.setText(wholesale ? wallTimeToMasked(wholesale) : maskTimeText(next));
  };

  const setMeridiem = (next: Meridiem) => {
    field.setText(applyMeridiem(field.text, next));
    inputRef.current?.focus();
  };

  const computeCoords = useCallback((): PopupCoords | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const panelHeight = panelRef.current?.scrollHeight || PANEL_HEIGHT_ESTIMATE;
    const panelWidth = panelRef.current?.offsetWidth || PANEL_WIDTH;
    const spaceBelow = window.innerHeight - rect.bottom - GUTTER;
    const spaceAbove = rect.top - GUTTER;

    let left = rect.left;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - panelWidth;
    if (left > maxLeft) left = maxLeft;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    const placeBelow =
      placementRef.current != null
        ? placementRef.current === 'below'
        : panelHeight <= spaceBelow || spaceBelow >= spaceAbove;
    placementRef.current = placeBelow ? 'below' : 'above';
    if (placeBelow) {
      return { top: rect.bottom + GUTTER, left, maxHeight: Math.max(0, spaceBelow - VIEWPORT_MARGIN) };
    }
    return {
      bottom: window.innerHeight - rect.top + GUTTER,
      left,
      maxHeight: Math.max(0, spaceAbove - VIEWPORT_MARGIN),
    };
  }, []);

  const applyCoords = useCallback(() => {
    setCoords((prev) => {
      const next = computeCoords();
      return sameCoords(prev, next) ? prev : next;
    });
  }, [computeCoords]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      placementRef.current = null;
      return;
    }
    applyCoords();
  }, [open, applyCoords]);

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
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideContainer && !insidePanel) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key.toLowerCase();
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

    if (!open && !disabled && !hasModifier && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      return;
    }

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

  const input = (
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
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(' ') || undefined}
        aria-invalid={invalid || undefined}
        aria-haspopup={!disabled ? 'dialog' : undefined}
        aria-expanded={!disabled ? open : undefined}
        aria-controls={open ? panelId : undefined}
        data-min={min}
      />

      {hasDigits && !disabled && (
        <div className="mr-1 flex shrink-0 gap-0.5" role="group" aria-label="Meridiem">
          {(['am', 'pm'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMeridiem(option)}
              aria-pressed={meridiem === option}
              aria-label={option === 'am' ? 'AM' : 'PM'}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-bold uppercase transition-colors',
                meridiem === option
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-primary/10 hover:text-primary',
              )}
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

  const popover =
    open &&
    createPortal(
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label="Choose time"
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
        <TimePanel
          selected={value}
          min={min}
          onSelect={(next) => {
            field.setText(wallTimeToMasked(next));
            setOpen(false);
            inputRef.current?.focus();
          }}
        />
      </div>,
      document.body,
    );

  if (variant === 'bare') {
    return (
      <div ref={containerRef}>
        {input}
        {popover}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={containerClass}>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">{input}</div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Open time picker"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className="mr-1 shrink-0 rounded p-1 text-text-secondary hover:bg-primary/10 hover:text-primary"
          >
            <i className="mdi mdi-clock-outline text-base" aria-hidden="true" />
          </button>
        )}
      </div>

      {popover}
    </div>
  );
}
