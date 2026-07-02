import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';

export interface ExportAppointmentImportErrorsInput {
  importId: string;
  actor: AuthContext;
}

interface ImportRowResultEntry {
  rowNumber: number;
  status: 'created' | 'error';
  message?: string;
}

// Neutralize formula-triggering prefixes (CSV/formula injection, CWE-1236) —
// a message that happened to start with =, +, -, or @ would otherwise
// execute as a formula when the exported file is opened in Excel/Sheets.
const FORMULA_PREFIX_RE = /^[=+\-@]/;

function csvEscape(value: string): string {
  const safe = FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Downloadable CSV of every error row from the last commit attempt (mirrors
 * the property importer's export). Reads `resultsJson` — this feature's
 * commit worker never populates the legacy `errorsJson` field. */
export class ExportAppointmentImportErrorsUseCase {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ExportAppointmentImportErrorsInput): Promise<string> {
    const { importId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment.import',
      entityType: 'AppointmentImport',
    });

    // Only AM is cross-tenant here (matches GetImportStatusUseCase / CommitAppointmentImportUseCase).
    const tenantScope = actor.role === 'AM' ? null : actor.tenantId;
    const importRecord = await this.importRepo.findById(importId, tenantScope);
    if (!importRecord) {
      throw new NotFoundError('IMPORT_NOT_FOUND', `Appointment import ${importId} not found`);
    }

    const results = Array.isArray(importRecord.resultsJson) ? (importRecord.resultsJson as ImportRowResultEntry[]) : [];
    const errorRows = results.filter((r) => r.status === 'error');

    const header = 'row,message';
    const rows = errorRows.map((r) => `${r.rowNumber},${csvEscape(String(r.message ?? ''))}`);

    return [header, ...rows].join('\n');
  }
}
