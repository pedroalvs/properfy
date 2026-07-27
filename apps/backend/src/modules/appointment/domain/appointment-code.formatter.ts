import type { TenantEntity } from '../../tenant/domain/tenant.entity';

// Prefix may be alphanumeric (e.g. "AB12") and is always 3-4 chars, matching the
// appointmentCodePrefixSchema contract — keep parse() in sync so malformed codes
// (wrong-length prefix) don't parse as valid.
const CODE_PATTERN = /^[A-Za-z0-9]{3,4}-(\d+)$/;

/** Postgres `integer` ceiling — appointment_number's column type. */
const INT4_MAX = 2_147_483_647;

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

  /**
   * Search-box variant of {@link parse}: accepts a formatted code
   * ("INS-0071") **or** the bare number the operator reads off the screen
   * ("0071", "71").
   *
   * The padding only exists in the formatted string — the column stores a plain
   * integer — so the bare form has to be read as a NUMBER. Matching it as a
   * substring of the stored value would compare "0071" against "71" and never
   * hit. Returns null for anything else so the caller falls back to text search.
   */
  static parseSearchTerm(term: string): number | null {
    // `appointment_number` is int4: handing Postgres a larger value makes the
    // whole query throw, so BOTH branches are capped. CODE_PATTERN's `\d+` is
    // unbounded, so the prefixed form ("INS-99999999999") reaches the same
    // overflow — capping only the bare digits would leave the 500 open.
    const formatted = this.parse(term);
    if (formatted !== null) return formatted <= INT4_MAX ? formatted : null;

    const trimmed = term.trim();
    if (!/^\d{1,10}$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return num <= INT4_MAX ? num : null;
  }
}
