import type { TenantEntity } from '../../tenant/domain/tenant.entity';

// Prefix may be alphanumeric (e.g. "AB12"), so allow digits in the prefix segment.
const CODE_PATTERN = /^[A-Za-z0-9]+-(\d+)$/;

export class AppointmentCodeFormatter {
  format(appointmentNumber: number, tenant: TenantEntity): string {
    // Prefix is now a dedicated tenant column; fall back to "INS" for legacy
    // tenants whose prefix has not been backfilled yet.
    const prefix = tenant.appointmentCodePrefix || 'INS';
    const padded = String(appointmentNumber).padStart(4, '0');
    return `${prefix}-${padded}`;
  }

  /**
   * Extracts the appointment number from a formatted code string.
   * E.g. "INS-0042" -> 42, "ABC-0001" -> 1.
   * Returns null for invalid formats.
   */
  static parse(code: string): number | null {
    const match = CODE_PATTERN.exec(code);
    if (!match) return null;
    const numStr = match[1]!;
    const num = Number(numStr);
    return Number.isNaN(num) ? null : num;
  }
}
