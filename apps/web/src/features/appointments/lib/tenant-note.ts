/**
 * Cap on the note text shown in a hover tooltip. The portal accepts up to 2000
 * characters (`rentalTenantPortal` schemas), which as a hover bubble would cover
 * the row the operator is trying to read. The full text stays in the detail
 * drawer, so the tooltip only has to carry enough to act on.
 */
export const TENANT_NOTE_TOOLTIP_MAX_CHARS = 300;

/** Shown when the row says a note exists but the payload carries no text. */
const GENERIC_NOTICE = 'Tenant left a note';

/**
 * Label for the tenant-note icon on the appointment list and board.
 *
 * `hasRentalTenantNote` gates the icon; this turns the accompanying
 * `rentalTenantNote` into the hover text. The generic fallback is kept for
 * payloads that flag the note without the text (the map bulk-action rows type
 * both fields as optional).
 */
export function formatTenantNoteTooltip(note: string | null | undefined): string {
  const text = note?.trim();
  if (!text) return GENERIC_NOTICE;

  return text.length > TENANT_NOTE_TOOLTIP_MAX_CHARS
    ? `Note: ${text.slice(0, TENANT_NOTE_TOOLTIP_MAX_CHARS)}…`
    : `Note: ${text}`;
}
