import type { Prisma } from '@prisma/client';
import type {
  PropertyIssueEntity,
  NewPropertyIssue,
  AppointmentScope,
} from './property-issue.entity';

export interface IPropertyIssueRepository {
  create(input: NewPropertyIssue, tx?: Prisma.TransactionClient): Promise<PropertyIssueEntity>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<PropertyIssueEntity | null>;
  /** Non-deleted issues of a property, newest first; confined to `tenantId` when set. */
  listByProperty(
    propertyId: string,
    tenantId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyIssueEntity[]>;
  /** Non-deleted issues of an appointment, newest first; confined to `tenantId` when set. */
  listByAppointment(
    appointmentId: string,
    tenantId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyIssueEntity[]>;
  /**
   * Compare-and-swap mark-as-seen (D23). Updates only when still unseen and not
   * deleted; returns the number of rows affected (1 = this call marked it,
   * 0 = already seen or deleted).
   */
  markSeenCas(id: string, userId: string, now: Date): Promise<number>;
  softDelete(
    id: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /** The property+tenant an appointment belongs to (D1 validation), or null. */
  findAppointmentScope(
    appointmentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AppointmentScope | null>;
}

/**
 * Narrow reader for the unseen-issue indicators (D26). `tenantId === undefined`
 * means cross-tenant (AM/OP); a string pins the query to that agency (CL_ADMIN).
 */
export interface IPropertyIssueIndicatorReader {
  /** Subset of `appointmentIds` that have an unseen, non-deleted issue. */
  findAppointmentsWithUnseenIssues(
    appointmentIds: string[],
    tenantId: string | undefined,
  ): Promise<Set<string>>;
  /** Subset of `propertyIds` that have ANY unseen, non-deleted issue. */
  findPropertiesWithUnseenIssues(
    propertyIds: string[],
    tenantId: string | undefined,
  ): Promise<Set<string>>;
  /** Distinct appointments with an unseen, non-deleted issue (sidebar dot). */
  countAppointmentsWithUnseenIssues(tenantId: string | undefined): Promise<number>;
  /** Distinct properties with an unseen, non-deleted issue WITHOUT an appointment (D26). */
  countPropertiesWithUnseenIssuesWithoutAppointment(
    tenantId: string | undefined,
  ): Promise<number>;
}
