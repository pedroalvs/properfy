interface AppointmentCodePillProps {
  /** Formatted code (e.g. "INS-0042" or a property code like "PROP-001"). */
  code: string;
  /** Optional aria label for screen readers when the code's meaning isn't obvious from context. */
  ariaLabel?: string;
}

/**
 * 025 — small reusable monospace chip used by the MapBulkActionModal
 * (appointment code column) and AppointmentMapDetailPanel (properties
 * section header). Pre-empts raw UUID rendering: callers always pass
 * the human-readable formatted code, never the raw `appointment.id`.
 */
export function AppointmentCodePill({ code, ariaLabel }: AppointmentCodePillProps) {
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
