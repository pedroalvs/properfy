import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';

export interface ExportImportErrorsInput {
  importId: string;
  actor: AuthContext;
}

interface ImportErrorEntry {
  row: number;
  field: string;
  code: string;
  message: string;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class ExportImportErrorsUseCase {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ExportImportErrorsInput): Promise<string> {
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

    const errors = (importRecord.errorsJson ?? []) as ImportErrorEntry[];

    const header = 'row,field,code,message';
    const rows = errors.map(
      (e) =>
        `${e.row},${csvEscape(String(e.field ?? ''))},${csvEscape(String(e.code ?? ''))},${csvEscape(String(e.message ?? ''))}`,
    );

    return [header, ...rows].join('\n');
  }
}
