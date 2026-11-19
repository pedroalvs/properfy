/**
 * Humanizes a transition reason code for display: `CLIENT_REQUEST` →
 * `Client Request`.
 *
 * Deliberately derived from the enum rather than a hand-written label map: a
 * code added to `CancellationReasonCode`/`RejectionReasonCode` then renders
 * sensibly everywhere instead of falling through to a blank cell. Shared so the
 * appointments table, the transition dialog and the XLSX export can never
 * disagree about how a code reads.
 */
/**
 * Codes whose humanized form would read wrong or too tersely. The auto-derive
 * would give "Inspector No Show" / "Not Executed"; these F07-1 accountability
 * codes carry a specific operator-facing phrasing that guides the choice in the
 * transition dialog (TASK-F07-3). Anything not listed here still auto-derives.
 */
const REASON_CODE_LABEL_OVERRIDES: Record<string, string> = {
  INSPECTOR_NO_SHOW: "Inspector didn't attend",
  NOT_EXECUTED: 'Inspection was not actually carried out',
};

export function formatReasonCodeLabel(code: string | null | undefined): string {
  if (!code) return '';
  const override = REASON_CODE_LABEL_OVERRIDES[code];
  if (override) return override;
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
