/**
 * Masks a notification recipient (email or phone) for anything that persists
 * beyond the notification row itself — audit payloads, logs. Recipients are PII,
 * and the per-subject erasure workflow redacts only registered PII field paths,
 * so it cannot find a raw address buried in audit free text. Keeping the mask in
 * one place stops the two call sites (real send + test send) from drifting.
 */
export function maskRecipient(recipient: string): string {
  return `***${recipient.slice(-4)}`;
}
