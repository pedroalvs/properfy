import { randomUUID } from 'crypto';
import type { AuthContext, BillingPeriodType, InspectorInvoiceStatus } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';
import { InvoicePeriodOverlapError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';

export interface GenerateInvoiceInput {
  inspectorId: string;
  tenantId?: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  periodType?: BillingPeriodType; // defaults to 'BIWEEKLY'
  currency?: string; // defaults to 'AUD'
  actor: AuthContext;
}

export interface GenerateInvoiceOutput {
  id: string;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  generatedByUserId: string | null;
  generatedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GenerateInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
    private readonly tenantRepo?: ITenantRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: GenerateInvoiceInput): Promise<GenerateInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd, actor } = input;

    // 1. Validate role AM/OP
    this.authorizationService?.assertRoles(actor, ['AM', 'OP'], { action: 'financial.generate_invoice', entityType: 'InspectorInvoice' });

    // Resolve tenant timezone for period boundary computation
    const tenantId = input.tenantId ?? actor.tenantId;
    let timezone = 'UTC';
    if (tenantId && this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant) {
        timezone = tenant.timezone;
      }
    }

    const startDate = parseDateInTimezone(periodStart, timezone);
    const endDate = parseDateInTimezone(periodEnd, timezone);

    // 2. Check exact match (idempotent)
    const existing = await this.invoiceRepo.findByInspectorAndPeriod(inspectorId, startDate, endDate);
    if (existing) {
      return {
        id: existing.id,
        inspectorId: existing.inspectorId,
        periodStart: formatDate(existing.periodStart),
        periodEnd: formatDate(existing.periodEnd),
        periodType: existing.periodType,
        status: existing.status,
        totalAmount: Number(existing.totalAmount),
        currency: existing.currency,
        fileKey: existing.fileKey,
        generatedByUserId: existing.generatedByUserId,
        generatedAt: existing.generatedAt?.toISOString() ?? null,
        paidAt: existing.paidAt?.toISOString() ?? null,
        notes: existing.notes,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    // 3. Check overlapping
    const overlapping = await this.invoiceRepo.findOverlapping(inspectorId, startDate, endDate);
    if (overlapping) {
      throw new InvoicePeriodOverlapError();
    }

    // 4. Sum approved payouts
    const totalAmount = await this.financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod(
      inspectorId,
      startDate,
      endOfDay(endDate),
    );

    // 5. Create entity
    const now = new Date();
    const invoiceId = randomUUID();
    const invoice = new InspectorInvoiceEntity({
      id: invoiceId,
      inspectorId,
      periodStart: startDate,
      periodEnd: endDate,
      periodType: input.periodType ?? 'BIWEEKLY',
      status: 'CLOSED',
      totalAmount,
      currency: input.currency ?? 'AUD',
      fileKey: null,
      previousInvoiceId: null,
      generatedByUserId: actor.userId,
      generatedAt: now,
      paidAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Save
    await this.invoiceRepo.save(invoice);

    // 7. Audit log
    this.auditService.log({
      action: 'invoice.generated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId,
        periodStart,
        periodEnd,
        status: 'CLOSED',
        totalAmount: Number(totalAmount),
        currency: input.currency ?? 'AUD',
      },
    });

    // Enqueue file generation job
    if (this.jobQueue) {
      await this.jobQueue.enqueue('billing.generate-invoice-file', { invoiceId });
    }

    return {
      id: invoiceId,
      inspectorId,
      periodStart: formatDate(invoice.periodStart),
      periodEnd: formatDate(invoice.periodEnd),
      periodType: invoice.periodType,
      status: invoice.status,
      totalAmount: Number(totalAmount),
      currency: input.currency ?? 'AUD',
      fileKey: invoice.fileKey,
      generatedByUserId: invoice.generatedByUserId,
      generatedAt: invoice.generatedAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }
}

/**
 * Parse a YYYY-MM-DD date string as the start of that day (00:00:00) in the
 * given IANA timezone, returning a UTC Date.
 *
 * Uses Intl.DateTimeFormat to resolve the UTC offset for the given date in
 * the target timezone, which correctly handles DST transitions.
 */
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  if (timezone === 'UTC') {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  // Build midnight in the target timezone by finding the UTC offset
  const offsetMinutes = getTimezoneOffsetMinutes(dateStr, timezone);
  const utcMs = new Date(`${dateStr}T00:00:00.000Z`).getTime() - offsetMinutes * 60_000;
  return new Date(utcMs);
}

/**
 * Returns the UTC offset in minutes for a given date string and timezone.
 * Positive means ahead of UTC (e.g. +600 for AEST).
 */
function getTimezoneOffsetMinutes(dateStr: string, timezone: string): number {
  // Create a reference date at noon UTC to avoid edge-case DST ambiguity
  const refDate = new Date(`${dateStr}T12:00:00.000Z`);

  // Format in the target timezone to extract the local date/time parts
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(refDate);

  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '0';

  const localYear = parseInt(get('year'), 10);
  const localMonth = parseInt(get('month'), 10) - 1;
  const localDay = parseInt(get('day'), 10);
  let localHour = parseInt(get('hour'), 10);
  if (localHour === 24) localHour = 0;
  const localMinute = parseInt(get('minute'), 10);
  const localSecond = parseInt(get('second'), 10);

  // Build the same instant as if it were UTC
  const localAsUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute, localSecond);

  // Offset = local - UTC (in ms)
  return Math.round((localAsUtc - refDate.getTime()) / 60_000);
}

function endOfDay(value: Date): Date {
  // Add 23:59:59.999 worth of milliseconds to the start-of-day UTC instant
  return new Date(value.getTime() + 23 * 3600_000 + 59 * 60_000 + 59 * 1000 + 999);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
