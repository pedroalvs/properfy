/**
 * T-1 Visibility Rule
 *
 * An appointment appears in the inspector's schedule at T-1 (day before) if:
 * - It is SCHEDULED, AND
 * - One of:
 *   - flow_type is INGOING or OUTGOING (no tenant confirmation required)
 *   - tenantConfirmationStatus = CONFIRMED
 *   - keyRequired = true
 */
export class T1VisibilityService {
  /**
   * @param flowType - Service type flow type (ROUTINE, INGOING, OUTGOING)
   * @param tenantConfirmationStatus - Current tenant confirmation status
   * @param keyRequired - Whether key access is available
   * @param scheduledDate - The appointment's scheduled date
   * @param today - Current date (for T-1 comparison)
   * @returns true if the appointment is visible for the inspector
   */
  isVisibleForInspector(
    flowType: string,
    tenantConfirmationStatus: string,
    keyRequired: boolean,
    scheduledDate: Date,
    today: Date,
  ): boolean {
    // Non-routine appointments are always visible when SCHEDULED
    if (flowType === 'INGOING' || flowType === 'OUTGOING') {
      return true;
    }

    // Check if scheduledDate is tomorrow (T-1)
    const isTomorrow = this.isNextDay(today, scheduledDate);

    // If not T-1 (i.e., today or further), visible
    if (!isTomorrow) {
      return true;
    }

    // T-1 for ROUTINE: only visible if confirmed or key required
    if (tenantConfirmationStatus === 'CONFIRMED') {
      return true;
    }

    if (keyRequired) {
      return true;
    }

    return false;
  }

  private isNextDay(today: Date, target: Date): boolean {
    // Compare dates only (no time component)
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffMs = targetDate.getTime() - todayDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays === 1;
  }
}
