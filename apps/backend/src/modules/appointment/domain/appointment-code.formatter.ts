import type { TenantEntity } from '../../tenant/domain/tenant.entity';

const CODE_PATTERN = /^[A-Za-z]+-(\d+)$/;

export class AppointmentCodeFormatter {
  format(appointmentNumber: number, tenant: TenantEntity): string {
    const settings = tenant.settingsJson;
    const prefix =
      typeof settings.appointmentCodePrefix === 'string' && settings.appointmentCodePrefix.length > 0
        ? settings.appointmentCodePrefix
        : 'INS';
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
