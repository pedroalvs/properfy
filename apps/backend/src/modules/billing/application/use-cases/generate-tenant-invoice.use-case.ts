import { randomUUID } from 'crypto';
import type { AuthContext, TenantInvoiceStatus } from '@properfy/shared';
import type { ITenantInvoiceRepository } from '../../domain/tenant-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { TenantInvoiceEntity } from '../../domain/tenant-invoice.entity';
import { TenantInvoicePeriodOverlapError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface GenerateTenantInvoiceInput {
  tenantId: string;
  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  currency?: string; // defaults to 'AUD'
  actor: AuthContext;
}

export interface GenerateTenantInvoiceOutput {
  id: string;
  tenantId: string;
  periodFrom: string;
  periodTo: string;
  totalDebit: number;
  totalRefund: number;
  totalAdjustment: number;
  netAmount: number;
  currency: string;
  status: TenantInvoiceStatus;
  fileKey: string | null;
  previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GenerateTenantInvoiceUseCase {
  constructor(
    private readonly tenantInvoiceRepo: ITenantInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: GenerateTenantInvoiceInput): Promise<GenerateTenantInvoiceOutput> {
    const { tenantId, periodFrom, periodTo, actor } = input;

    // 1. Validate role AM/OP
    this.authorizationService?.assertRoles(actor, ['AM', 'OP'], { action: 'financial.generate_tenant_invoice', entityType: 'TenantInvoice' });

    const fromDate = parseDateOnly(periodFrom);
    const toDate = parseDateOnly(periodTo);

    // 2. Check exact match (idempotent)
    const existing = await this.tenantInvoiceRepo.findByTenantAndPeriod(tenantId, fromDate, toDate);
    if (existing) {
      return mapToOutput(existing);
    }

    // 3. Check overlapping
    const overlapping = await this.tenantInvoiceRepo.findOverlapping(tenantId, fromDate, toDate);
    if (overlapping) {
      throw new TenantInvoicePeriodOverlapError();
    }

    // 4. Sum approved entries (TENANT_DEBIT - REFUND + MANUAL_ADJUSTMENT)
    const sums = await this.financialEntryRepo.sumApprovedEntriesForTenantInPeriod(
      tenantId,
      fromDate,
      endOfDay(toDate),
    );

    const netAmount = sums.totalDebit - sums.totalRefund + sums.totalAdjustment;

    // 5. Create entity
    const now = new Date();
    const invoiceId = randomUUID();
    const currency = input.currency ?? 'AUD';
    const invoice = new TenantInvoiceEntity({
      id: invoiceId,
      tenantId,
      periodFrom: fromDate,
      periodTo: toDate,
      totalDebit: sums.totalDebit,
      totalRefund: sums.totalRefund,
      totalAdjustment: sums.totalAdjustment,
      netAmount,
      currency,
      status: 'CLOSED',
      fileKey: null,
      previousInvoiceId: null,
      generatedByUserId: actor.userId,
      generatedAt: now,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Save
    await this.tenantInvoiceRepo.save(invoice);

    // 7. Audit log
    this.auditService.log({
      action: 'tenant_invoice.generated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'TenantInvoice',
      entityId: invoiceId,
      tenantId,
      after: {
        tenantId,
        periodFrom,
        periodTo,
        status: 'CLOSED',
        totalDebit: sums.totalDebit,
        totalRefund: sums.totalRefund,
        totalAdjustment: sums.totalAdjustment,
        netAmount,
        currency,
      },
    });

    // 8. Enqueue file generation job
    if (this.jobQueue) {
      await this.jobQueue.enqueue('billing.generate-tenant-invoice-file', { invoiceId });
    }

    return mapToOutput(invoice);
  }
}

function mapToOutput(invoice: TenantInvoiceEntity): GenerateTenantInvoiceOutput {
  return {
    id: invoice.id,
    tenantId: invoice.tenantId,
    periodFrom: formatDate(invoice.periodFrom),
    periodTo: formatDate(invoice.periodTo),
    totalDebit: Number(invoice.totalDebit),
    totalRefund: Number(invoice.totalRefund),
    totalAdjustment: Number(invoice.totalAdjustment),
    netAmount: Number(invoice.netAmount),
    currency: invoice.currency,
    status: invoice.status,
    fileKey: invoice.fileKey,
    previousInvoiceId: invoice.previousInvoiceId,
    generatedByUserId: invoice.generatedByUserId,
    generatedAt: invoice.generatedAt?.toISOString() ?? null,
    notes: invoice.notes,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(value: Date): Date {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
