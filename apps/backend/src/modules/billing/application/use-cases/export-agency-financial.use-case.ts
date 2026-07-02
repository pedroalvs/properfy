import type { AuthContext, FinancialEntryType } from '@properfy/shared';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
} from '../../domain/financial-entry.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IXlsxGenerator, ReportColumn } from '../../../report/domain/xlsx-generator';
import { ValidationError } from '../../../../shared/domain/errors';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
import { requireAgencyTenantScope } from '../agency-scope';

/** Agency-visible entry types (never INSPECTOR_PAYOUT). Mirrors the extrato read. */
const AGENCY_ENTRY_TYPES: FinancialEntryType[] = ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Cap for a single synchronous export. Statements above this must be narrowed
 * with a date range, so the hot request path never loads/encodes an unbounded
 * history (would risk timeouts / memory pressure).
 */
const MAX_EXPORT_ROWS = 5000;

const COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', width: 14 },
  { key: 'type', label: 'Type', width: 18 },
  { key: 'property', label: 'Property', width: 18 },
  { key: 'description', label: 'Description', width: 40 },
  { key: 'amount', label: 'Amount', width: 14 },
  { key: 'currency', label: 'Currency', width: 10 },
  { key: 'status', label: 'Status', width: 12 },
];

export interface ExportAgencyFinancialInput {
  tenantId?: string;
  fromDate?: string;
  toDate?: string;
  actor: AuthContext;
}

export interface ExportAgencyFinancialOutput {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export class ExportAgencyFinancialUseCase {
  constructor(
    private readonly entryRepo: IFinancialEntryRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly xlsxGenerator: IXlsxGenerator,
  ) {}

  async execute(input: ExportAgencyFinancialInput): Promise<ExportAgencyFinancialOutput> {
    const { actor } = input;

    // Resolve the single agency scope. CL roles are forced to their own tenant
    // (fail closed — they can never target another tenant via `input.tenantId`);
    // AM/OP (tenant-null) may target a tenant explicitly.
    let tenantId: string | undefined;
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = requireAgencyTenantScope(actor);
    } else {
      tenantId = actor.tenantId ?? input.tenantId;
    }
    if (!tenantId) {
      throw new ValidationError('A tenant scope is required to export a financial statement', []);
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    const filters: FinancialEntryFilters = {
      tenantId,
      entryTypeIn: [...AGENCY_ENTRY_TYPES],
    };
    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    // Bounded, on-demand statement: fetch the full set (count then take) so the
    // export is never silently truncated. Reject over-large sets instead of
    // synchronously loading/encoding an unbounded history on the request thread.
    const total = await this.entryRepo.count(filters);
    if (total > MAX_EXPORT_ROWS) {
      throw new ValidationError(
        `This statement has ${total} entries (max ${MAX_EXPORT_ROWS} per export). Narrow the date range and try again.`,
        [],
      );
    }
    const enriched = total > 0
      ? await this.entryRepo.findAllEnriched(filters, {
          page: 1,
          pageSize: total,
          sortBy: 'effectiveAt',
          sortOrder: 'desc',
        })
      : [];

    const rows = enriched.map(({ entity, appointmentCode }) => ({
      date: entity.effectiveAt.toISOString().slice(0, 10),
      type: entity.entryType,
      property: appointmentCode ?? '',
      description: entity.description,
      amount: Number(entity.amount),
      currency: entity.currency,
      status: entity.status,
    }));

    const buffer = await this.xlsxGenerator.generate(COLUMNS, rows);

    const range = [input.fromDate, input.toDate].filter(Boolean).join('_');
    const filename = `financial-statement${range ? `-${range}` : ''}.xlsx`;

    return {
      filename,
      contentType: XLSX_MIME,
      contentBase64: buffer.toString('base64'),
    };
  }
}
