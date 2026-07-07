import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { ServiceGroupValidator } from '../../domain/service-group.validator';

export interface EligibilityCheckInput {
  groupId: string;
  appointmentIds: string[];
  actor: AuthContext;
}

export interface EligibilityCheckOutput {
  eligibleAppointmentIds: string[];
  ineligibleAppointmentIds: Array<{ id: string; reasonCode: string }>;
  groupAccepts: boolean;
  groupReasons: string[];
}

/**
 * 026 §FR-510 — Read-only eligibility preview for the Add-to-group sub-modal.
 *
 * Runs the same `ServiceGroupValidator.canAddToGroup` predicate as the
 * write endpoint, but commits nothing. The frontend uses this to:
 *   - show ineligible markers with their reason codes before the
 *     operator commits;
 *   - decide whether the "Add (N)" button is enabled at all.
 *
 * The eligibility snapshot is not a guarantee — the write endpoint
 * re-validates each item because the group state may have changed
 * between preview and commit (another operator could fill the group
 * in the meantime). That's intentional: the preview is a UX affordance,
 * not a reservation.
 */
export class CheckAppointmentsEligibilityForGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: EligibilityCheckInput): Promise<EligibilityCheckOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.add_to_group',
      entityType: 'ServiceGroup',
      entityId: input.groupId,
    });

    const groupTenantScope = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const found = await this.groupRepo.findById(input.groupId, groupTenantScope);
    if (!found) {
      throw new NotFoundError('SERVICE_GROUP_NOT_FOUND', `Service group ${input.groupId} not found`);
    }
    const { group } = found;
    const currentSize = found.appointments.length;

    const eligibleAppointmentIds: string[] = [];
    const ineligibleAppointmentIds: Array<{ id: string; reasonCode: string }> = [];

    for (const apptId of input.appointmentIds) {
      const foundAppt = await this.appointmentRepo.findById(apptId, null);
      if (!foundAppt) {
        ineligibleAppointmentIds.push({ id: apptId, reasonCode: 'NOT_FOUND' });
        continue;
      }
      const { appointment } = foundAppt;
      const validation = ServiceGroupValidator.canAddToGroup(
        {
          id: appointment.id,
          appointmentNumber: appointment.appointmentNumber,
          status: appointment.status,
          serviceTypeId: appointment.serviceTypeId,
          tenantId: appointment.tenantId,
          serviceGroupId: appointment.serviceGroupId,
        },
        {
          status: group.status,
          serviceTypeId: group.serviceTypeId,
          // Hypothetical capacity: each eligible appointment increments
          // the running total so a group at 28 + 5 candidates reports
          // GROUP_CAPACITY_EXCEEDED for items beyond slot 30.
          currentSize: currentSize + eligibleAppointmentIds.length,
        },
      );
      if (validation.ok) {
        eligibleAppointmentIds.push(appointment.id);
      } else {
        ineligibleAppointmentIds.push({ id: appointment.id, reasonCode: validation.reasonCode });
      }
    }

    // Group-level disposition: even if every individual item is eligible,
    // a terminal-state group rejects the whole add. Aggregated separately
    // so the UI can surface a single banner instead of N identical reasons.
    const groupReasons: string[] = [];
    if (!ServiceGroupValidator.isAddableStatus(group.status)) {
      groupReasons.push('GROUP_IN_TERMINAL_STATE');
    }
    if (currentSize >= 30) {
      groupReasons.push('GROUP_CAPACITY_EXCEEDED');
    }

    return {
      eligibleAppointmentIds,
      ineligibleAppointmentIds,
      groupAccepts: groupReasons.length === 0,
      groupReasons,
    };
  }
}
