import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';

export interface GetPropertyImportStatusInput {
  importId: string;
  actor: AuthContext;
}

export interface GetPropertyImportStatusOutput {
  id: string;
  tenantId: string;
  status: string;
  originalFilename: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: unknown[] | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GetPropertyImportStatusUseCase {
  constructor(private readonly importRepo: IPropertyImportRepository) {}

  async execute(input: GetPropertyImportStatusInput): Promise<GetPropertyImportStatusOutput> {
    const { importId, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenantScope = (actor.role === 'AM' || actor.role === 'OP') ? null : actor.tenantId;
    const importRecord = await this.importRepo.findById(importId, tenantScope);

    if (!importRecord) {
      throw new NotFoundError('IMPORT_NOT_FOUND', `Property import ${importId} not found`);
    }

    return {
      id: importRecord.id,
      tenantId: importRecord.tenantId,
      status: importRecord.status,
      originalFilename: importRecord.originalFilename,
      totalRows: importRecord.totalRows,
      successCount: importRecord.successCount,
      errorCount: importRecord.errorCount,
      errorsJson: importRecord.errorsJson,
      createdByUserId: importRecord.createdByUserId,
      createdAt: importRecord.createdAt,
      updatedAt: importRecord.updatedAt,
    };
  }
}
