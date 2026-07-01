import { z } from 'zod';
import { ReportType, ReportStatus, ReportDateAxis } from '../enums/misc';
import { AppointmentStatus } from '../enums/appointment';

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required')
  .refine((s) => {
    // Reject impossible calendar dates (e.g. 2026-02-31) that the regex allows.
    // The preceding regex guarantees exactly three numeric parts.
    const [y, mo, d] = s.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }, 'Invalid calendar date');

/**
 * Content filters for the report generator.
 *
 * The Period (`fromDate`..`toDate`) applies to the domain field selected by
 * `dateAxis` for appointment-based reports (Appointments / Performance / Agencies).
 * The Financial report ignores `dateAxis`, `status` and `groupProperties` and ranges
 * on `financial_entries.effective_at` instead. `status` narrows the Appointments report.
 */
export const reportFiltersSchema = z
  .object({
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
    dateAxis: z.nativeEnum(ReportDateAxis).default(ReportDateAxis.SCHEDULED),
    /** AM/OP: scope the report to a single agency (tenant). */
    tenantId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    /** Locality filter — matched case-insensitively against `property.suburb`. */
    suburb: z.string().max(120).optional(),
    /** Appointment status — selects which appointments enter the Appointments report. */
    status: z.nativeEnum(AppointmentStatus).optional(),
    /** When true, Appointments-report rows are grouped (ordered) by property. */
    groupProperties: z.boolean().default(false),
  })
  .refine((f) => new Date(f.toDate) >= new Date(f.fromDate), {
    message: 'toDate must be >= fromDate',
    path: ['toDate'],
  });

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const requestReportSchema = z.object({
  reportType: z.nativeEnum(ReportType),
  filters: reportFiltersSchema,
});

export type RequestReportInput = z.infer<typeof requestReportSchema>;

/**
 * Query for the reports list/history. This is an operational job log, so `status`
 * here is the generation-job status (PENDING/PROCESSING/READY/FAILED) — deliberately
 * distinct from the generator's appointment `status` content filter.
 */
export const listReportsQuerySchema = z.object({
  reportType: z.nativeEnum(ReportType).optional(),
  status: z.nativeEnum(ReportStatus).optional(),
  fromDate: dateStringSchema.optional(),
  toDate: dateStringSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
