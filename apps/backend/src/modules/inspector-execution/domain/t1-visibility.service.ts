/**
 * T-1 Visibility Rule
 *
 * Every appointment that reaches this service is already SCHEDULED (accepted by
 * an inspector — see the callers: the schedule, the appointment detail, the day
 * plan, Live Day and property files all pass only SCHEDULED rows). An accepted
 * job stays visible to the inspector who took it, so it is NOT hidden while the
 * rental tenant has yet to confirm — hiding it is the "disappearing schedule"
 * bug reported from HML (PO sign-off 2026-11: show it with an "awaiting tenant
 * confirmation" badge instead). The PWA flags the pending state; starting an
 * unconfirmed routine job stays blocked by the independent confirmation gate in
 * `start-inspection.use-case.ts` (step 4b), which this rule does not touch.
 *
 * A job is visible when:
 * - flow_type is INGOING or OUTGOING (no tenant confirmation required), OR
 * - the service type does not require tenant confirmation, OR
 * - keyRequired = true, OR
 * - rentalTenantConfirmationStatus is anything other than UNAVAILABLE.
 *
 * It is hidden only when the rental tenant actively reported UNAVAILABLE, which
 * drives its own rejection flow.
 */
export class T1VisibilityService {
  /**
   * @param flowType - Service type flow type (ROUTINE, INGOING, OUTGOING)
   * @param rentalTenantConfirmationStatus - Current tenant confirmation status
   * @param keyRequired - Whether key access is available
   * @param _scheduledDate - Unused since the T-1 date hide was removed; kept so the
   *   many call sites (and their timezone plumbing) stay unchanged.
   * @param _todayCivil - Unused; see `_scheduledDate`.
   * @returns true if the appointment is visible for the inspector
   */
  isVisibleForInspector(
    flowType: string,
    rentalTenantConfirmationStatus: string,
    keyRequired: boolean,
    _scheduledDate: Date,
    _todayCivil: string,
    requiresRentalTenantConfirmation: boolean = true,
  ): boolean {
    // Non-routine appointments are always visible when SCHEDULED
    if (flowType === 'INGOING' || flowType === 'OUTGOING') {
      return true;
    }

    if (!requiresRentalTenantConfirmation) {
      return true;
    }

    if (keyRequired) {
      return true;
    }

    // The rental tenant actively reported they will not be available: this drives
    // its own rejection flow, so the job is not shown as an actionable stop.
    if (rentalTenantConfirmationStatus === 'UNAVAILABLE') {
      return false;
    }

    // CONFIRMED, PENDING and NO_RESPONSE: the inspector accepted the job, so it
    // stays visible regardless of how close the scheduled date is. Pending
    // confirmation is surfaced as an "awaiting confirmation" badge in the app.
    return true;
  }
}
