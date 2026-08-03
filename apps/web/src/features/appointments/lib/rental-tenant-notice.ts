/**
 * Whether the rental tenant has plausibly already been told this inspection
 * exists — the condition under which cancelling may offer to notify them.
 *
 * This is a **client-side approximation** of the server's rule. The backend asks
 * the authoritative question ("does an INSPECTION_NOTICE row exist for this
 * appointment?") and discards an opt-in that does not hold, logging the discard.
 * The UI cannot ask that without a per-row notification lookup on every list,
 * board and map payload, so it approximates from fields already on the wire:
 *
 * - `SCHEDULED` — INSPECTION_NOTICE goes out on the move into this status, so a
 *   scheduled appointment has been announced.
 * - `CONFIRMED` — the tenant said they would be home. This is a first-class arm on
 *   the server too, not a shortcut: a ROUTINE service type requiring confirmation
 *   can only reach SCHEDULED once already confirmed, so a confirmed tenant may have
 *   no notice row at all.
 *
 * Known under-offer, and it is a CLASS rather than one path: **any route that
 * leaves SCHEDULED without the tenant confirming** keeps its notice rows, so the
 * server would honour an opt-in the UI does not offer. Instances include
 * `reopen-for-reschedule` (resets confirmation to PENDING, status to DRAFT),
 * cancelling or rejecting an ACCEPTED service group (reverts members to
 * AWAITING_INSPECTOR and leaves confirmation untouched), SCHEDULED -> REJECTED ->
 * CANCELLED, and re-cancelling after CANCELLED -> DRAFT.
 *
 * Closing it needs the notice fact on the appointment payload; tracked as a
 * follow-up rather than guessed at here. Do NOT "fix" it by always offering the
 * checkbox: that trades a visible under-offer for a silent over-offer, and the
 * server's refusal is log-only.
 *
 * Deliberately NOT `rentalTenantConfirmationStatus === 'CONFIRMED'` alone: the
 * notice is sent regardless of confirmation, so requiring confirmation meant a
 * tenant who was told the date but never clicked confirm could never be told it
 * was called off.
 */
export function wasRentalTenantNotified(appointment: {
  status: string;
  rentalTenantConfirmationStatus?: string | null;
}): boolean {
  return (
    appointment.status === 'SCHEDULED' ||
    appointment.rentalTenantConfirmationStatus === 'CONFIRMED'
  );
}
