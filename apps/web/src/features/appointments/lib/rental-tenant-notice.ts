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
 * - `CONFIRMED` — the tenant acted on the notice, which only happens if they got
 *   it. Kept as a separate arm so an appointment reopened out of SCHEDULED after
 *   the tenant confirmed still offers the choice.
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
