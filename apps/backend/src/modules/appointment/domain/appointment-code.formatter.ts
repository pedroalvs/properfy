import type { TenantEntity } from '../../tenant/domain/tenant.entity';

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
}
