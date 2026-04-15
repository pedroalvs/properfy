import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';

export interface GetImportStatusInput {
  importId: string;
  actor: AuthContext;
}

export interface GetImportStatusOutput {
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

export class GetImportStatusUseCase {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetImportStatusInput): Promise<GetImportStatusOutput> {
    const { importId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], { action: 'appointment.import', entityType: 'AppointmentImport' });

    // Only AM is cross-tenant per Sprint 1 W-4-IMPL (CORRECTION-001 close-it).
    const tenantScope = actor.role === 'AM' ? null : actor.tenantId;
    const importRecord = await this.importRepo.findById(importId, tenantScope);

    if (!importRecord) {
      throw new NotFoundError('IMPORT_NOT_FOUND', `Appointment import ${importId} not found`);
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
