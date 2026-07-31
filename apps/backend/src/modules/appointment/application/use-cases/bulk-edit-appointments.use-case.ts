import type { AuthContext, AppointmentContactRole } from '@properfy/shared';
import { DomainError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { UpdateAppointmentUseCase } from './update-appointment.use-case';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IPricingRuleRepository } from '../../../pricing-rule/domain/pricing-rule.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import { resolvePricingRule } from '../../../pricing-rule/domain/resolve-pricing-rule';
import { snapshotPricing, calculatePayoutAmount } from '../../domain/appointment-pricing.service';

const ALLOWED_FIELDS = new Set([
  'assignedInspectorId',
  'scheduledDate',
  'timeSlotStart',
  'timeSlotEnd',
  'branchId',
  'serviceTypeId',
  'propertyManagerContactId',
]);

const TERMINAL_STATUSES = new Set(['DONE', 'REJECTED', 'CANCELLED']);

export interface BulkEditOptions {
  /**
   * Property-Manager contact change policy.
   * - `replace` (default): overwrite the existing PM junction row.
   * - `addIfMissing`: skip appointments that already have a PM contact;
   *   they're surfaced in `failed[]` with code `APPOINTMENT_HAS_EXISTING_CONTACT`.
   */
  propertyManagerContactPolicy?: 'replace' | 'addIfMissing';
  /**
   * Opt-in: widen a service group's shared time window when a grouped row's
   * new slot falls outside it, instead of rejecting the row. Forwarded to
   * `UpdateAppointmentUseCase`, which owns the rule.
   */
  expandGroupTimeWindow?: boolean;
}

export interface BulkEditInput {
  ids: string[];
  changes: Record<string, unknown>;
  options?: BulkEditOptions;
  actor: AuthContext;
  requestId?: string;
}

export interface BulkEditResult {
  updated: number;
  failed: Array<{ id: string; code: string; message: string }>;
}

export class BulkEditAppointmentsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly contactRepo: IContactRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    /**
     * Owns every schedule rule and every reschedule side effect. Required, not
     * optional: a missing dependency would silently fall back to a bare repo
     * write, which is exactly the bug this delegation removes.
     */
    private readonly updateAppointment: UpdateAppointmentUseCase,
    private readonly logger: Logger,
  ) {}

  /**
   * Fold a per-row failure into `failed[]`.
   *
   * A row rejection travels inside an HTTP 200, so it never reaches the global
   * error handler: without this, an infrastructure fault mid-batch is invisible
   * server-side AND its raw message (Prisma's include host and SQL fragments)
   * is rendered verbatim in the operator's modal.
   *
   * The discriminator is `instanceof DomainError`, NOT the presence of a
   * `code`: Prisma's errors carry one too (`P1001` is literally "Can't reach
   * database server at <host>:<port>"), so a truthiness check on `code` would
   * wave through the exact class of error this exists to contain.
   * Mirrors `bulk-cross-check-done.use-case.ts`.
   */
  private toFailedEntry(
    appointmentId: string,
    err: unknown,
    batchId?: string,
  ): { id: string; code: string; message: string } {
    if (err instanceof DomainError) {
      return { id: appointmentId, code: err.code, message: err.message };
    }
    this.logger.error({ err, appointmentId, batchId }, 'Unexpected error during bulk edit');
    return {
      id: appointmentId,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    };
  }

  async execute(input: BulkEditInput): Promise<BulkEditResult> {
    const { ids, changes, actor } = input;

    // RBAC: AM and OP only
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'appointment.bulk_edit',
      entityType: 'Appointment',
    });

    // Validate: no unknown fields
    for (const key of Object.keys(changes)) {
      if (!ALLOWED_FIELDS.has(key)) {
        const { AppointmentBulkFieldNotAllowedError } = await import('../../domain/appointment.errors');
        throw new AppointmentBulkFieldNotAllowedError(key);
      }
    }

    const tenantId = actor.tenantId; // OP is tenant-scoped; AM may be null
    const updated: string[] = [];
    const failed: Array<{ id: string; code: string; message: string }> = [];

    for (const appointmentId of ids) {
      try {
        const found = await this.appointmentRepo.findById(appointmentId, tenantId);
        if (!found) {
          failed.push({ id: appointmentId, code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found or not in tenant scope' });
          continue;
        }

        const { appointment } = found;
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        const updateData: Record<string, unknown> = {};

        // Schedule edits delegate to UpdateAppointmentUseCase rather than
        // being re-implemented here. It owns the status guard, the service
        // group rules (a member's date is the group's to move), the TZ
        // past-date check, and — critically — the reschedule side effects a
        // bare `repo.update` skips: resetting the rental tenant's
        // confirmation, revoking their live portal token and notifying them.
        //
        // Collected here but executed AFTER every guard below, because that
        // notification is externally visible: a row rejected by a later guard
        // must never have already emailed the tenant about a reschedule.
        const scheduleData = {
          ...(changes.scheduledDate !== undefined ? { scheduledDate: changes.scheduledDate as string } : {}),
          ...(changes.timeSlotStart !== undefined ? { timeSlotStart: changes.timeSlotStart as string } : {}),
          ...(changes.timeSlotEnd !== undefined ? { timeSlotEnd: changes.timeSlotEnd as string } : {}),
        };

        /** Held until the writes section, so a later guard can still reject the row. */
        let pendingPmJunction: AppointmentContactEntity | null = null;

        // Per-field guardrails — validation only, no writes
        if (changes.assignedInspectorId !== undefined) {
          if (TERMINAL_STATUSES.has(appointment.status)) {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_UPDATE_NOT_ALLOWED', message: `Cannot assign inspector on ${appointment.status} appointment` });
            continue;
          }
          const inspectorId = changes.assignedInspectorId as string;
          const inspector = await this.inspectorRepo.findById(inspectorId);
          if (!inspector || inspector.status !== 'ACTIVE') {
            failed.push({ id: appointmentId, code: 'INSPECTOR_INACTIVE', message: `Inspector ${inspectorId} is not active` });
            continue;
          }
          // Eligibility uses the blocked-clients deny-list: an inspector is
          // eligible for a tenant unless that tenant is in its block list.
          if (!inspector.isEligibleForTenant(appointment.tenantId)) {
            failed.push({ id: appointmentId, code: 'INSPECTOR_NOT_ELIGIBLE', message: `Inspector not eligible for tenant ${appointment.tenantId}` });
            continue;
          }
          before['inspectorId'] = appointment.inspectorId;
          after['inspectorId'] = inspectorId;
          updateData['inspectorId'] = inspectorId;
        }

        if (changes.branchId !== undefined) {
          if (appointment.status !== 'DRAFT') {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED', message: 'Branch change only allowed on DRAFT appointments' });
            continue;
          }
          before['branchId'] = appointment.branchId;
          after['branchId'] = changes.branchId;
          updateData['branchId'] = changes.branchId;
        }

        if (changes.serviceTypeId !== undefined) {
          if (appointment.status !== 'DRAFT') {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_UPDATE_NOT_ALLOWED', message: 'Service type change only allowed on DRAFT appointments' });
            continue;
          }
          // Re-resolve pricing with new service type + potentially new branch
          const effectiveBranchId = (changes.branchId as string) ?? appointment.branchId;
          const pricingRules = await this.pricingRuleRepo.findAll(
            { tenantId: appointment.tenantId, serviceTypeId: changes.serviceTypeId as string, status: 'ACTIVE' },
            { page: 1, pageSize: 100, sortOrder: 'asc' },
          );
          const pricingRule = resolvePricingRule(pricingRules, effectiveBranchId);
          if (!pricingRule) {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_NO_PRICE_RULE', message: 'No active pricing rule for the new service type' });
            continue;
          }
          const snapshot = snapshotPricing(pricingRule);
          const payoutAmount = calculatePayoutAmount(
            pricingRule.priceAmount,
            pricingRule.payoutType,
            pricingRule.payoutValue,
          );
          before['serviceTypeId'] = appointment.serviceTypeId;
          before['priceAmount'] = appointment.priceAmount;
          before['payoutAmount'] = appointment.payoutAmount;
          after['serviceTypeId'] = changes.serviceTypeId;
          after['priceAmount'] = pricingRule.priceAmount;
          after['payoutAmount'] = payoutAmount;
          updateData['serviceTypeId'] = changes.serviceTypeId;
          updateData['priceAmount'] = pricingRule.priceAmount;
          updateData['payoutAmount'] = payoutAmount;
          updateData['pricingRuleSnapshotJson'] = snapshot;
        }

        if (changes.propertyManagerContactId !== undefined) {
          const pmContactId = changes.propertyManagerContactId as string;
          const pmContact = await this.contactRepo.findById(pmContactId, appointment.tenantId);
          if (!pmContact) {
            failed.push({ id: appointmentId, code: 'CONTACT_NOT_FOUND', message: `PM contact ${pmContactId} not found in tenant` });
            continue;
          }
          if (!pmContact.isActive) {
            failed.push({ id: appointmentId, code: 'CONTACT_INACTIVE', message: `PM contact ${pmContactId} is not active` });
            continue;
          }
          const existingContacts = found.contacts ?? [];
          const existingPm = existingContacts.find((c) => c.role === 'PROPERTY_MANAGER');
          // `addIfMissing` policy: skip and report when the appointment already
          // has a PM contact. Default `replace` keeps the historical behaviour
          // (insert; partial unique index on (appointment_id, contact_id) dedups).
          if (existingPm && input.options?.propertyManagerContactPolicy === 'addIfMissing') {
            failed.push({
              id: appointmentId,
              code: 'APPOINTMENT_HAS_EXISTING_CONTACT',
              message: 'Appointment already has a Property Manager contact; skipped per addIfMissing policy',
            });
            continue;
          }
          // Built now, saved below with the other writes — see the note on
          // validate-then-write ordering above the schedule delegation.
          pendingPmJunction = new AppointmentContactEntity({
            id: crypto.randomUUID(),
            appointmentId,
            contactId: pmContact.id,
            role: 'PROPERTY_MANAGER' as AppointmentContactRole,
            isPrimary: false, // PM is not the primary contact
            snapshotName: pmContact.displayName,
            snapshotEmail: pmContact.primaryEmail,
            snapshotPhone: pmContact.primaryPhone,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          after['propertyManagerContactId'] = pmContactId;
        }

        // ── Writes start here. Every guard above has passed. ──────────────
        // The schedule goes first because it is the only one with external
        // side effects (it notifies the rental tenant), so it must not run
        // until nothing else can still reject the row.
        if (Object.keys(scheduleData).length > 0) {
          try {
            await this.updateAppointment.execute({
              appointmentId,
              data: scheduleData,
              actor,
              // The delegate writes the audit entry for this row, so the batch
              // attribution has to travel with the call — otherwise 40 bulk-moved
              // appointments look identical to 40 manual drawer edits.
              auditMetadata: { source: 'bulk-edit', batchId: input.requestId },
              ...(input.options?.expandGroupTimeWindow ? { expandGroupTimeWindow: true } : {}),
            });
          } catch (err: unknown) {
            failed.push(this.toFailedEntry(appointmentId, err, input.requestId));
            continue;
          }
        }

        if (pendingPmJunction) {
          await this.appointmentRepo.saveContact(pendingPmJunction);
        }

        // Apply non-PM field updates
        if (Object.keys(updateData).length > 0) {
          await this.appointmentRepo.update(appointmentId, appointment.tenantId, updateData as any);
        }

        // Audit per row — only for the fields this use case still owns.
        // A schedule-only edit is audited by UpdateAppointmentUseCase, so
        // logging here too would emit a second, empty before/after row.
        if (Object.keys(before).length > 0 || Object.keys(after).length > 0) {
          this.auditService.log({
            action: 'appointment.updated',
            actorType: 'USER',
            actorId: actor.userId,
            entityType: 'Appointment',
            entityId: appointmentId,
            tenantId: appointment.tenantId,
            before,
            after,
            metadata: { source: 'bulk-edit', batchId: input.requestId },
          });
        }

        updated.push(appointmentId);
      } catch (err: unknown) {
        failed.push(this.toFailedEntry(appointmentId, err, input.requestId));
      }
    }

    return { updated: updated.length, failed };
  }
}
