import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
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
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetPropertyImportStatusInput): Promise<GetPropertyImportStatusOutput> {
    const { importId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'property.import',
      entityType: 'Property',
    });

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
