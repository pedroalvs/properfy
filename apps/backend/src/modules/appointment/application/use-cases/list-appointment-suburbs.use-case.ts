import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import { APPOINTMENT_LIST_ROLES, resolveAppointmentListTenantScope } from '../appointment-list-scope';

export interface ListAppointmentSuburbsInput {
  tenantId?: string;
  actor: AuthContext;
}

export interface ListAppointmentSuburbsOutput {
  suburbs: string[];
}

/**
 * Distinct suburbs across the appointments the actor may see — the option list
 * behind the appointments-list Suburb filter.
 */
export class ListAppointmentSuburbsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListAppointmentSuburbsInput): Promise<ListAppointmentSuburbsOutput> {
    this.authorizationService.assertRoles(input.actor, [...APPOINTMENT_LIST_ROLES], {
      action: 'appointment.list',
      entityType: 'Appointment',
    });

    const tenantId = resolveAppointmentListTenantScope(input.actor, input.tenantId);
    const suburbs = await this.appointmentRepo.findDistinctSuburbs(tenantId);

    return { suburbs };
  }
}
