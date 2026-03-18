import type { AppointmentImportEntity } from './appointment-import.entity';

export interface IAppointmentImportRepository {
  findById(id: string, tenantId: string | null): Promise<AppointmentImportEntity | null>;
  save(entity: AppointmentImportEntity): Promise<void>;
  update(
    id: string,
    data: Partial<{
      status: string;
      totalRows: number;
      successCount: number;
      errorCount: number;
      errorsJson: unknown[];
    }>,
  ): Promise<void>;
}
