interface AppointmentCodePillProps {
  /** Formatted code (e.g. "INS-0042" or a property code like "PROP-001"). */
  code: string;
  /** Optional aria label for screen readers when the code's meaning isn't obvious from context. */
  ariaLabel?: string;
  /**
   * 026 §FR-560 — when provided, the pill becomes interactive (button
   * semantics, keyboard activation, hover affordance). Used by the
   * MapBulkActionModal row cells to open the marker detail panel. When
   * absent the pill is display-only (preserves the 025 caller surface).
   */
  onClick?: () => void;
}

/**
 * 025 — small reusable monospace chip; 026 — optionally clickable.
 *
 * The clickable variant pre-empts raw UUID rendering AND gives the
 * operator a way to jump from any row reference to the canonical
 * detail surface. Default styling is display-only so existing callers
 * (panel header, code reuse) keep working unchanged.
 */
export function AppointmentCodePill({ code, ariaLabel, onClick }: AppointmentCodePillProps) {
  if (onClick) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
      // Match native button semantics: Enter + Space activate.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          // Stop propagation so a parent row click (e.g. checkbox row select)
          // doesn't fire alongside the pill click.
          e.stopPropagation();
          onClick();
        }}
        onKeyDown={handleKeyDown}
        className="inline-flex cursor-pointer items-center rounded bg-orange-100 px-2 py-0.5 font-mono text-xs font-medium text-orange-800 transition-colors hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
        aria-label={ariaLabel ?? `Open details for appointment ${code}`}
        data-testid="appointment-code-pill"
      >
        {code}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 font-mono text-xs font-medium text-orange-800"
      aria-label={ariaLabel}
      data-testid="appointment-code-pill"
    >
      {code}
    </span>
  );
}
