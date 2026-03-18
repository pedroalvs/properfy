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
    }>,
  ): Promise<void>;
}
