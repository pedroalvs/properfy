import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface AddableGroupSummary {
  id: string;
  name: string | null;
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
 *  - All appointments share the same tenantId, serviceTypeId, scheduledDate,
 *    and timeSlot (the canAddToGroup invariants). If mixed → early return
 *    with reason = 'MIXED_APPOINTMENT_PROPERTIES'.
 *
 * Group filters applied by the repository query:
 *  - Same tenant, same serviceType, same scheduledDate, compatible timeWindow
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

    // Pre-condition: all appointments must share tenantId, serviceTypeId, scheduledDate, timeSlot.
    const isMixed = valid.some(
      (a) =>
        a.tenantId !== first.tenantId ||
        a.serviceTypeId !== first.serviceTypeId ||
        a.scheduledDate?.toISOString().slice(0, 10) !== first.scheduledDate?.toISOString().slice(0, 10) ||
        a.timeSlot !== first.timeSlot,
    );
    if (isMixed) return { groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' };

    // Pre-condition: all appointments must be in a groupable status.
    const GROUPABLE_STATUSES = new Set(['DRAFT', 'AWAITING_INSPECTOR']);
    const ineligibleByStatus = valid.filter((a) => !GROUPABLE_STATUSES.has(a.status));
    if (ineligibleByStatus.length > 0) return { groups: [], reason: 'INVALID_APPOINTMENT_STATUS' };

    const groups = await this.groupRepo.findAddableForAppointments({
      tenantId: first.tenantId,
      serviceTypeId: first.serviceTypeId,
      scheduledDate: first.scheduledDate,
      timeSlot: first.timeSlot ?? '',
      batchSize: input.appointmentIds.length,
    });

    return { groups };
  }
}
