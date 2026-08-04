import { RATING_MAX, RATING_MIN } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IRentalTenantPortalActivityRepository } from '../../../rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import { RentalTenantPortalActivityEntity } from '../../../rental-tenant-portal/domain/rental-tenant-portal-activity.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
} from '../../../rental-tenant-portal/domain/rental-tenant-portal.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { SatisfactionSurveyEntity } from '../../domain/satisfaction-survey.entity';
import type { ISatisfactionSurveyRepository } from '../../domain/satisfaction-survey.repository';
import {
  PortalSurveyNoInspectorError,
  PortalSurveyNotEligibleError,
} from '../../domain/satisfaction-survey.errors';

export interface SubmitSatisfactionSurveyInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  rating: number;
  comment?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SubmitSatisfactionSurveyOutput {
  rating: number;
  comment: string | null;
  submittedAt: string;
  /** True when this call resolved to a response the tenant had already given. */
  alreadySubmitted: boolean;
}

export class SubmitSatisfactionSurveyUseCase {
  constructor(
    private readonly surveyRepo: ISatisfactionSurveyRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: SubmitSatisfactionSurveyInput): Promise<SubmitSatisfactionSurveyOutput> {
    // 1. A read-only token is how the survey window closes. The DONE hook extends
    // the token to 14 days; once that passes the middleware flips it to EXPIRED
    // and marks the context read-only, so no extra deadline check is needed here.
    if (input.isReadOnly) {
      throw new PortalActionBlockedError();
    }

    // NOTE: there is deliberately NO `isUsed` check and NO `tryClaim` call here,
    // unlike confirm/join-group. `used_at` is set when the tenant confirms or
    // joins a group, so guarding on it would deny the survey to everyone who
    // confirmed attendance — the happy path. Replay safety comes from the unique
    // index on appointment_id instead, which is stronger anyway: it holds across
    // tokens, not just within one.

    // Same reason `isPastConfirmCutoff` is not consulted: on a DONE appointment
    // the confirmation cutoff is long past by definition, and it gates attending,
    // not rating.

    if (!Number.isInteger(input.rating) || input.rating < RATING_MIN || input.rating > RATING_MAX) {
      throw new PortalSurveyNotEligibleError(
        `Rating must be a whole number between ${RATING_MIN} and ${RATING_MAX}`,
      );
    }

    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new PortalAppointmentInactiveError();
    }
    const { appointment } = result;

    // 2. Only an executed inspection can be rated.
    if (appointment.status !== 'DONE') {
      throw new PortalSurveyNotEligibleError();
    }

    // 3. inspector_id is NOT NULL on the survey row, and a rating with nobody to
    // attribute it to would be meaningless anyway.
    if (!appointment.inspectorId) {
      throw new PortalSurveyNoInspectorError();
    }

    const comment = input.comment?.trim() ? input.comment.trim() : null;
    const now = new Date();
    const id = crypto.randomUUID();

    const stored = await this.surveyRepo.submit(
      new SatisfactionSurveyEntity({
        id,
        appointmentId: input.appointmentId,
        tenantId: appointment.tenantId,
        inspectorId: appointment.inspectorId,
        rating: input.rating,
        comment,
        submittedAt: now,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        createdAt: now,
      }),
    );

    // 4. A replay resolved to the stored response. Recording a second activity row
    // and a second audit entry would suggest the tenant answered twice.
    //
    // Identity is the discriminator, not the timestamp: two submissions landing in
    // the same millisecond would make a `submittedAt` comparison report a replay
    // as a fresh answer. The id we minted comes back only when our own insert won.
    const alreadySubmitted = stored.id !== id;
    if (alreadySubmitted) {
      return {
        rating: stored.rating,
        comment: stored.comment,
        submittedAt: stored.submittedAt.toISOString(),
        alreadySubmitted: true,
      };
    }

    // 5. Activity carries the rating only. This feed is exposed via
    // GET /v1/appointments/:id/portal-activities, whose RBAC is weaker than the
    // survey read endpoints — putting the comment here would route around the
    // access model.
    await this.activityRepo.save(
      new RentalTenantPortalActivityEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        rentalTenantPortalTokenId: input.tokenId,
        action: 'SURVEY_SUBMITTED',
        previousValuesJson: null,
        newValuesJson: { rating: stored.rating },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        createdAt: now,
      }),
    );

    // 6. Audit likewise omits the comment: audit rows are immutable and outlive
    // erasure requests.
    this.auditService.log({
      action: 'rental_tenant_portal.survey_submitted',
      actorType: 'ANONYMOUS',
      entityType: 'SatisfactionSurvey',
      entityId: stored.id,
      tenantId: appointment.tenantId,
      after: { rating: stored.rating, inspectorId: stored.inspectorId },
      ipAddress: input.ipAddress ?? undefined,
    });

    return {
      rating: stored.rating,
      comment: stored.comment,
      submittedAt: stored.submittedAt.toISOString(),
      alreadySubmitted: false,
    };
  }
}
