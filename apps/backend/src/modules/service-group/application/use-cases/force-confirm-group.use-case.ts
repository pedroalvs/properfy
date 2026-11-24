import type { AuthContext } from '@properfy/shared';
import { isTerminalAppointmentStatus } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import { ServiceGroupNotFoundError } from '../../domain/service-group.errors';

const DEFAULT_REASON = 'Confirmed on the rental tenant\'s behalf (group schedule change)';

export interface ForceConfirmGroupInput {
  groupId: string;
  reason?: string;
  actor: AuthContext;
}

export interface ForceConfirmGroupOutput {
  groupId: string;
  confirmedCount: number;
  skippedCount: number;
}

/**
 * Bulk force-confirm — moves every unconfirmed member of a group to CONFIRMED in
 * one call, mirroring {@link ForceManualTenantConfirmationUseCase} per member.
 *
 * It is the terminal write of the "confirm on the tenants' behalf & move" branch
 * of the date-change flow: the operator moves the group (NOTIFY_ONLY, which keeps
 * confirmations) and then force-confirms the unconfirmed members so they are not
 * swept by the T-1 reject. Run it AFTER the schedule change — NOTIFY_ONLY never
 * re-PENDINGs, so nothing undoes the force-confirm; RESEND would, which is why the
 * two choices are mutually exclusive.
 *
 * Idempotent: an already-CONFIRMED member is skipped, so re-running confirms
 * nothing new. Terminal members (DONE/CANCELLED/REJECTED) are skipped. For a
 * tenant-pinned CL_* actor, only members of the actor's own agency are touched —
 * a group can be cross-tenant.
 */
export class ForceConfirmGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly cycleService?: ConfirmationCycleService,
  ) {}

  async execute(input: ForceConfirmGroupInput): Promise<ForceConfirmGroupOutput> {
    const { groupId, actor } = input;
    const reason = input.reason ?? DEFAULT_REASON;

    // RBAC: same gate as the per-appointment force-confirmation. AM/OP/CL_ADMIN
    // pass unconditionally; CL_USER needs the `force_confirmation` flag.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], {
      action: 'appointment.force_confirmation',
      entityType: 'ServiceGroup',
    });
    this.authorizationService.assertClUserPermission(actor, 'force_confirmation');

    // AM/OP are platform-wide; a tenant-pinned role reads/writes its own tenant only.
    const isPinned = actor.role === 'CL_ADMIN' || actor.role === 'CL_USER';
    const tenantScope = isPinned ? actor.tenantId : null;

    const found = await this.serviceGroupRepo.findById(groupId, tenantScope);
    if (!found) throw new ServiceGroupNotFoundError();

    let confirmedCount = 0;
    let skippedCount = 0;

    for (const member of found.appointments) {
      // A tenant-pinned actor may only confirm its own agency's members (a group
      // can be cross-tenant). Defense in depth beyond the repo's tenant filter.
      if (isPinned && member.tenantId !== actor.tenantId) {
        skippedCount += 1;
        continue;
      }
      if (isTerminalAppointmentStatus(member.status)) {
        skippedCount += 1;
        continue;
      }
      if (member.rentalTenantConfirmationStatus === 'CONFIRMED') {
        skippedCount += 1;
        continue;
      }

      // Prefer the confirmation cycle (keeps the cycle and denorm in sync); fall
      // back to a direct denorm write for appointments with no active cycle.
      if (this.cycleService) {
        try {
          await this.cycleService.confirm(member.id, member.tenantId, 'OPERATOR_FORCED', null);
        } catch {
          await this.appointmentRepo.update(member.id, member.tenantId, {
            rentalTenantConfirmationStatus: 'CONFIRMED',
          });
        }
      } else {
        await this.appointmentRepo.update(member.id, member.tenantId, {
          rentalTenantConfirmationStatus: 'CONFIRMED',
        });
      }

      this.auditService.log({
        action: 'appointment.force_manual_confirmation',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: member.id,
        tenantId: member.tenantId,
        before: { rentalTenantConfirmationStatus: member.rentalTenantConfirmationStatus },
        after: { rentalTenantConfirmationStatus: 'CONFIRMED' },
        reason,
        metadata: { trigger: 'group_force_confirmation', groupId },
      });

      confirmedCount += 1;
    }

    return { groupId, confirmedCount, skippedCount };
  }
}
