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
export function formatReasonCodeLabel(code: string | null | undefined): string {
  if (!code) return '';
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
