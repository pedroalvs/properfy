/**
 * Formats auto-generated property codes: `<PREFIX>-PROP-<number padded to 4>`,
 * where PREFIX is the tenant's appointment_code_prefix and the number is the
 * per-tenant sequential `property_number`. Legacy tenants without a prefix get
 * `PROP-0001`.
 */
export class PropertyCodeFormatter {
  static formatParts(propertyNumber: number, prefix: string | null | undefined): string {
    const padded = String(propertyNumber).padStart(4, '0');
    return prefix ? `${prefix}-PROP-${padded}` : `PROP-${padded}`;
  }
}
