import type { TenantEntity } from '../../tenant/domain/tenant.entity';

// Prefix may be alphanumeric (e.g. "AB12") and is always 3-4 chars, matching the
// appointmentCodePrefixSchema contract — keep parse() in sync so malformed codes
// (wrong-length prefix) don't parse as valid.
const CODE_PATTERN = /^[A-Za-z0-9]{3,4}-(\d+)$/;

export class AppointmentCodeFormatter {
  format(appointmentNumber: number, tenant: TenantEntity): string {
    return AppointmentCodeFormatter.formatParts(appointmentNumber, tenant.appointmentCodePrefix);
  }

  /**
   * Core formatting from raw parts (prefix + number), without a TenantEntity. Falls back to "INS"
   * for legacy tenants whose prefix has not been backfilled. Used where only the prefix column is
   * available (e.g. the invoice snapshot mapper).
   */
  static formatParts(appointmentNumber: number, prefix: string | null | undefined): string {
    const p = prefix || 'INS';
    const padded = String(appointmentNumber).padStart(4, '0');
    return `${p}-${padded}`;
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
