import type { AuthContext } from '@properfy/shared';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { NotFoundError, ForbiddenError } from '../../../../shared/domain/errors';

export interface ListPortalActivitiesInput {
  appointmentId: string;
  actor: AuthContext;
  page: number;
  pageSize: number;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;

export class ListPortalActivitiesUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: ListPortalActivitiesInput) {
    // 1. Validate actor role — AM/OP (platform) and CL_ADMIN (own agency)
    if (!ALLOWED_ROLES.includes(input.actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('FORBIDDEN', 'Only AM, OP and CL_ADMIN roles can view portal activities');
    }

    // 2. Load appointment to verify it exists and enforce tenant scope.
    // AM/OP carry a null tenantId (platform-wide); CL_ADMIN is pinned to its own
    // agency here, which is the only tenant gate on this read — the activity
    // query in step 3 is keyed by appointment alone.
    const result = await this.appointmentRepo.findById(input.appointmentId, input.actor.tenantId);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    // 3. Query activities for this appointment
    const { activities, total } = await this.activityRepo.findByAppointmentId(
      input.appointmentId,
      input.page,
      input.pageSize,
    );

    return {
      data: activities.map((a) => ({
        id: a.id,
        appointmentId: a.appointmentId,
        rentalTenantPortalTokenId: a.rentalTenantPortalTokenId,
        action: a.action,
        previousValuesJson: a.previousValuesJson,
        newValuesJson: a.newValuesJson,
        ipAddress: a.ipAddress,
        userAgent: a.userAgent,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
