import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { assertTenantScope } from '../../../../shared/domain/require-tenant-scope';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ISatisfactionSurveyRepository } from '../../domain/satisfaction-survey.repository';

export interface GetAppointmentSurveyInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface GetAppointmentSurveyOutput {
  rating: number;
  comment: string | null;
  submittedAt: string;
}

const TENANT_PINNED_ROLES = ['CL_ADMIN', 'CL_USER'];

/**
 * The satisfaction response for one inspection, for the appointment detail
 * screen — where an operator investigating a complaint actually looks.
 *
 * Tenant isolation rides on `appointmentRepo.findById`, which already returns
 * null for another agency's appointment. That makes a cross-tenant read a 404,
 * matching how every other appointment-scoped endpoint behaves, rather than a
 * hand-rolled 403 that would confirm the appointment exists.
 *
 * INSP is refused: an inspector must never read the comment left about them.
 */
export class GetAppointmentSurveyUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly surveyRepo: ISatisfactionSurveyRepository,
  ) {}

  async execute(input: GetAppointmentSurveyInput): Promise<GetAppointmentSurveyOutput | null> {
    const { actor, appointmentId } = input;

    if (actor.role === 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Inspectors cannot read individual survey responses');
    }

    let tenantScope: string | null = null;
    if (TENANT_PINNED_ROLES.includes(actor.role)) {
      // Fail closed via the shared helper — see list-inspector-surveys.
      tenantScope = assertTenantScope(actor, 'appointment.survey.read');
    }

    // Enforces tenant isolation before we ever touch the survey table.
    const result = await this.appointmentRepo.findById(appointmentId, tenantScope);
    if (!result) return null;

    // The appointment's own tenant, not `tenantScope` — the latter is null for
    // AM/OP, and the repository now refuses an unscoped read outright. Reading
    // it off the row we just proved this caller may see keeps both roles working
    // without ever widening the query.
    const survey = await this.surveyRepo.findByAppointmentId(
      appointmentId,
      result.appointment.tenantId,
    );
    if (!survey) return null;

    return {
      rating: survey.rating,
      comment: survey.comment,
      submittedAt: survey.submittedAt.toISOString(),
    };
  }
}
