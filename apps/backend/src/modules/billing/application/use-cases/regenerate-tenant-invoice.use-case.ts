import { randomUUID } from 'crypto';
import type { AuthContext, TenantInvoiceStatus } from '@properfy/shared';
import type { ITenantInvoiceRepository } from '../../domain/tenant-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { TenantInvoiceEntity } from '../../domain/tenant-invoice.entity';
import { TenantInvoiceNotFoundError, TenantInvoiceNotRegenerableError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface RegenerateTenantInvoiceInput {
  invoiceId: string;
  reason?: string;
  actor: AuthContext;
}

export interface RegenerateTenantInvoiceOutput {
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

export class RegenerateTenantInvoiceUseCase {
  constructor(
    private readonly tenantInvoiceRepo: ITenantInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: RegenerateTenantInvoiceInput): Promise<RegenerateTenantInvoiceOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Validate role - AM only
    this.authorizationService?.assertRoles(actor, ['AM'], { action: 'financial.regenerate_tenant_invoice', entityType: 'TenantInvoice' });

    // 2. Load existing invoice
    const existing = await this.tenantInvoiceRepo.findById(invoiceId);
    if (!existing) {
      throw new TenantInvoiceNotFoundError();
    }

    // 3. Validate status is CLOSED or PAID
    if (!existing.canBeRegenerated()) {
      throw new TenantInvoiceNotRegenerableError();
    }

    // 4. Recalculate totals from current approved entries
    const sums = await this.financialEntryRepo.sumApprovedEntriesForTenantInPeriod(
      existing.tenantId,
      existing.periodFrom,
      endOfDay(existing.periodTo),
    );

    const netAmount = sums.totalDebit - sums.totalRefund + sums.totalAdjustment;

    // 5. Create new invoice
    const now = new Date();
    const newInvoiceId = randomUUID();
    const newInvoice = new TenantInvoiceEntity({
      id: newInvoiceId,
      tenantId: existing.tenantId,
      periodFrom: existing.periodFrom,
      periodTo: existing.periodTo,
      totalDebit: sums.totalDebit,
      totalRefund: sums.totalRefund,
      totalAdjustment: sums.totalAdjustment,
      netAmount,
      currency: existing.currency,
      status: 'CLOSED',
      fileKey: null,
      previousInvoiceId: invoiceId,
      generatedByUserId: actor.userId,
      generatedAt: now,
      notes: reason ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await this.tenantInvoiceRepo.save(newInvoice);

    // 6. Mark old invoice as SUPERSEDED
    await this.tenantInvoiceRepo.update(invoiceId, {
      status: 'SUPERSEDED',
    });

    // 7. Audit log
    this.auditService.log({
      action: 'tenant_invoice.regenerated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'TenantInvoice',
      entityId: newInvoiceId,
      tenantId: existing.tenantId,
      reason,
      before: {
        previousInvoiceId: invoiceId,
        previousNetAmount: Number(existing.netAmount),
        previousStatus: existing.status,
      },
      after: {
        status: 'CLOSED',
        totalDebit: sums.totalDebit,
        totalRefund: sums.totalRefund,
        totalAdjustment: sums.totalAdjustment,
        netAmount,
        currency: existing.currency,
      },
    });

    // 8. Enqueue file generation
    if (this.jobQueue) {
      await this.jobQueue.enqueue('billing.generate-tenant-invoice-file', { invoiceId: newInvoiceId });
    }

    return {
      id: newInvoiceId,
      tenantId: existing.tenantId,
      periodFrom: formatDate(existing.periodFrom),
      periodTo: formatDate(existing.periodTo),
      totalDebit: sums.totalDebit,
      totalRefund: sums.totalRefund,
      totalAdjustment: sums.totalAdjustment,
      netAmount,
      currency: existing.currency,
      status: newInvoice.status,
      fileKey: newInvoice.fileKey,
      previousInvoiceId: invoiceId,
      generatedByUserId: newInvoice.generatedByUserId,
      generatedAt: newInvoice.generatedAt?.toISOString() ?? null,
      notes: newInvoice.notes,
      createdAt: newInvoice.createdAt.toISOString(),
      updatedAt: newInvoice.updatedAt.toISOString(),
    };
  }
}

function endOfDay(value: Date): Date {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
