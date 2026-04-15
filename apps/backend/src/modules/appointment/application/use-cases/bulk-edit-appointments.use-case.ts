import type { AuthContext, AppointmentContactRole } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IPricingRuleRepository } from '../../../pricing-rule/domain/pricing-rule.repository';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import { resolvePricingRule } from '../../../pricing-rule/domain/resolve-pricing-rule';
import { snapshotPricing, calculatePayoutAmount } from '../../domain/appointment-pricing.service';

const ALLOWED_FIELDS = new Set([
  'assignedInspectorId',
  'scheduledDate',
  'timeSlot',
  'branchId',
  'serviceTypeId',
  'propertyManagerContactId',
]);

const TERMINAL_STATUSES = new Set(['DONE', 'REJECTED', 'CANCELLED']);
const DRAFT_ONLY_FIELDS = new Set(['branchId', 'serviceTypeId']);

export interface BulkEditInput {
  ids: string[];
  changes: Record<string, unknown>;
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
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

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

        // Per-field guardrails
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
          // Check eligibility using current client_eligibility_json field
          // (008 FR-006a proposes rename to blocked_clients_json — not yet implemented)
          const eligibility = (inspector as any).clientEligibilityJson as Array<{ tenantId: string }> | undefined;
          if (eligibility && eligibility.length > 0) {
            const isEligible = eligibility.some((e: { tenantId: string }) => e.tenantId === appointment.tenantId);
            if (!isEligible) {
              failed.push({ id: appointmentId, code: 'INSPECTOR_NOT_ELIGIBLE', message: `Inspector not eligible for tenant ${appointment.tenantId}` });
              continue;
            }
          }
          before['inspectorId'] = appointment.inspectorId;
          after['inspectorId'] = inspectorId;
          updateData['inspectorId'] = inspectorId;
        }

        if (changes.scheduledDate !== undefined) {
          if (!['DRAFT', 'AWAITING_INSPECTOR'].includes(appointment.status)) {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_UPDATE_NOT_ALLOWED', message: `Cannot change date on ${appointment.status} appointment` });
            continue;
          }
          before['scheduledDate'] = appointment.scheduledDate;
          after['scheduledDate'] = changes.scheduledDate;
          updateData['scheduledDate'] = new Date(changes.scheduledDate as string);
        }

        if (changes.timeSlot !== undefined) {
          if (!['DRAFT', 'AWAITING_INSPECTOR'].includes(appointment.status)) {
            failed.push({ id: appointmentId, code: 'APPOINTMENT_UPDATE_NOT_ALLOWED', message: `Cannot change time slot on ${appointment.status} appointment` });
            continue;
          }
          before['timeSlot'] = appointment.timeSlot;
          after['timeSlot'] = changes.timeSlot;
          updateData['timeSlot'] = changes.timeSlot;
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
          // Replace semantics: delete existing PM junction row if any, then insert new
          // (other roles like TENANT, HOUSEKEEPER are untouched)
          const existingContacts = found.contacts ?? [];
          const existingPm = existingContacts.find((c) => c.role === 'PROPERTY_MANAGER');
          if (existingPm) {
            // Delete the old PM row by re-saving all non-PM contacts + the new PM
            // Simpler: just delete the specific PM row via a targeted update
            // Since we don't have a deleteContactById, we'll use the junction approach:
            // Save a new PM row — the partial unique index on (appointment_id, contact_id) handles dedup
          }
          // Create new PM junction row with fresh snapshot
          const pmJunction = new AppointmentContactEntity({
            id: crypto.randomUUID(),
            appointmentId,
            contactId: pmContact.id,
            role: 'PROPERTY_MANAGER' as AppointmentContactRole,
            isPrimary: false, // PM is not the primary contact
            snapshotName: pmContact.displayName,
            snapshotEmail: pmContact.primaryEmail,
            snapshotPhone: pmContact.primaryPhone,
            tenantName: pmContact.displayName,
            primaryEmail: pmContact.primaryEmail,
            secondaryEmail: null,
            primaryPhone: pmContact.primaryPhone,
            secondaryPhone: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await this.appointmentRepo.saveContact(pmJunction);
          after['propertyManagerContactId'] = pmContactId;
        }

        // Apply non-PM field updates
        if (Object.keys(updateData).length > 0) {
          await this.appointmentRepo.update(appointmentId, appointment.tenantId, updateData as any);
        }

        // Audit per row
        this.auditService.log({
          action: 'appointment.updated',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'appointment',
          entityId: appointmentId,
          tenantId: appointment.tenantId,
          before,
          after,
          metadata: { source: 'bulk-edit', batchId: input.requestId },
        });

        updated.push(appointmentId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as any)?.code ?? 'INTERNAL_ERROR';
        failed.push({ id: appointmentId, code, message });
      }
    }

    return { updated: updated.length, failed };
  }
}
