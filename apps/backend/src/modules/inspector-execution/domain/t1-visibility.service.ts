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

    if (keyRequired) {
      return true;
    }

    if (tenantConfirmationStatus === 'CONFIRMED') {
      return true;
    }

    if (tenantConfirmationStatus === 'UNAVAILABLE') {
      return false;
    }

    const isToday = this.isSameDay(today, scheduledDate);
    const isTomorrow = this.isNextDay(today, scheduledDate);

    if (isToday || isTomorrow) {
      return false;
    }

    return true;
  }

  private isNextDay(today: Date, target: Date): boolean {
    const diffDays = this.diffInDays(today, target);
    return diffDays === 1;
  }

  private isSameDay(today: Date, target: Date): boolean {
    const diffDays = this.diffInDays(today, target);
    return diffDays === 0;
  }

  private diffInDays(today: Date, target: Date): number {
    // Compare dates only (no time component)
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffMs = targetDate.getTime() - todayDate.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }
}
