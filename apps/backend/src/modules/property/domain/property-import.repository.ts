import type { PropertyImportEntity } from './property-import.entity';

export interface IPropertyImportRepository {
  findById(id: string, tenantId: string | null): Promise<PropertyImportEntity | null>;
  save(entity: PropertyImportEntity): Promise<void>;
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
