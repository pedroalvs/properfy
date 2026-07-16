/**
 * T-1 Visibility Rule
 *
 * An appointment appears in the inspector's schedule at T-1 (day before) if:
 * - It is SCHEDULED, AND
 * - One of:
 *   - flow_type is INGOING or OUTGOING (no tenant confirmation required)
 *   - rentalTenantConfirmationStatus = CONFIRMED
 *   - keyRequired = true
 */
export class T1VisibilityService {
  /**
   * @param flowType - Service type flow type (ROUTINE, INGOING, OUTGOING)
   * @param rentalTenantConfirmationStatus - Current tenant confirmation status
   * @param keyRequired - Whether key access is available
   * @param scheduledDate - The appointment's scheduled date (civil date pinned to UTC midnight)
   * @param todayCivil - Today's civil date (YYYY-MM-DD) in the platform timezone (Sydney)
   * @returns true if the appointment is visible for the inspector
   */
  isVisibleForInspector(
    flowType: string,
    rentalTenantConfirmationStatus: string,
    keyRequired: boolean,
    scheduledDate: Date,
    todayCivil: string,
  ): boolean {
    // Non-routine appointments are always visible when SCHEDULED
    if (flowType === 'INGOING' || flowType === 'OUTGOING') {
      return true;
    }

    if (keyRequired) {
      return true;
    }

    if (rentalTenantConfirmationStatus === 'CONFIRMED') {
      return true;
    }

    if (rentalTenantConfirmationStatus === 'UNAVAILABLE') {
      return false;
    }

    const diffDays = this.diffInDays(todayCivil, scheduledDate);

    if (diffDays === 0 || diffDays === 1) {
      return false;
    }

    return true;
  }

  private diffInDays(todayCivil: string, target: Date): number {
    // Civil-date string comparison — independent of server timezone and DST.
    const targetCivil = target.toISOString().slice(0, 10);
    const diffMs = Date.parse(`${targetCivil}T00:00:00Z`) - Date.parse(`${todayCivil}T00:00:00Z`);
    return diffMs / (1000 * 60 * 60 * 24);
  }
}
