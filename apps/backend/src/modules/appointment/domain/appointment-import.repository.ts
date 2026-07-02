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
      previewJson: unknown;
      resultsJson: unknown;
    }>,
  ): Promise<void>;
  /** Previews the operator never committed — candidates for the cleanup
   * sweep (deletes the orphaned storage file + this row). */
  findAbandonedPreviews(olderThan: Date): Promise<Array<{ id: string; fileKey: string }>>;
  deleteById(id: string): Promise<void>;
}
