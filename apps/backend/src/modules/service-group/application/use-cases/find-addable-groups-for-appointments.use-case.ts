import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface AddableGroupSummary {
  id: string;
  groupNumber: number;
  code: string;
  status: string;
  scheduledDate: Date;
  timeWindow: string;
  currentSize: number;
  serviceTypeName: string | null;
}

export interface FindAddableGroupsOutput {
  groups: AddableGroupSummary[];
  /** Populated when early-exit pre-conditions fail; groups will be empty. */
  reason?: 'MIXED_APPOINTMENT_PROPERTIES' | 'INVALID_APPOINTMENT_STATUS';
}

/**
 * 026 B1 — Returns only the service groups that can accept ALL of the
 * given appointments. Runs server-side pre-filtering so the "Add to group"
 * dropdown never shows groups the operator cannot use.
 *
 * Pre-conditions checked here (before querying groups):
 *  - All appointments share the same serviceTypeId (the canAddToGroup
 *    invariant). Date and time window are NOT criteria — appointments are
 *    re-scheduled to the group's date/window on join. Tenant is NOT
 *    required to match — groups are tenant-agnostic. If mixed service
 *    types → early return with reason = 'MIXED_APPOINTMENT_PROPERTIES'.
 *
 * Group filters applied by the repository query:
 *  - Same serviceType (date and time window are not filters)
 *  - Status ∈ {DRAFT, PUBLISHED}
 *  - currentSize + |appointmentIds| ≤ capacity (default 30)
 */
export class FindAddableGroupsForAppointmentsUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: { appointmentIds: string[]; actor: AuthContext }): Promise<FindAddableGroupsOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.add_to_group',
      entityType: 'ServiceGroup',
    });

    // Pre-fetch appointments — N ≤ 30 (schema max)
    const appointments = await Promise.all(
      input.appointmentIds.map((id) => this.appointmentRepo.findById(id, null)),
    );
    const valid = appointments.filter((r) => r !== null).map((r) => r!.appointment);

    if (valid.length === 0) return { groups: [] };

    const first = valid[0]!;

    // Pre-condition: all appointments must share serviceTypeId. Date and time
    // slot may differ (appointments are re-scheduled to the group's date on
    // join). Tenant may differ too — groups are tenant-agnostic.
    const isMixed = valid.some((a) => a.serviceTypeId !== first.serviceTypeId);
    if (isMixed) return { groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' };

    // Pre-condition: all appointments must be in a groupable status.
    // REJECTED is now groupable — it auto-transitions to AWAITING_INSPECTOR on group join (cycle 5).
    const GROUPABLE_STATUSES = new Set(['DRAFT', 'AWAITING_INSPECTOR', 'REJECTED']);
    const ineligibleByStatus = valid.filter((a) => !GROUPABLE_STATUSES.has(a.status));
    if (ineligibleByStatus.length > 0) return { groups: [], reason: 'INVALID_APPOINTMENT_STATUS' };

    const groups = await this.groupRepo.findAddableForAppointments({
      serviceTypeId: first.serviceTypeId,
      batchSize: input.appointmentIds.length,
    });

    return { groups };
  }
}
